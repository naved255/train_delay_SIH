"""FastAPI service for LightGBM railway delay prediction + SHAP."""

from __future__ import annotations

import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from utils.explain import build_explainers, build_reason, explain_row

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("MODEL_PATH", BASE_DIR / "models" / "lgbm_railway_delay.joblib"))

app = FastAPI(
    title="Railway Delay Intelligence ML Service",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_bundle = None
_explainers = None


class PredictRequest(BaseModel):
    # The fields below intentionally mirror the features produced by
    # backend/services/predictionService.js.
    train_number: str = "UNKNOWN"
    last_station: str = "UNKNOWN"
    station_name: str = "UNKNOWN"
    next_station: str = "UNKNOWN"
    delay_minutes: float = 0.0
    distance_km: float = 0.0
    latitude: float | None = None
    longitude: float | None = None
    precipitation_sum: float = 0.0
    is_fog_day: int = 0
    delay_trend_last3: float = 0.0
    track_type: str = "Unknown"
    level_crossings: int = 0
    is_ghat: int = 0
    sched_speed_kmh: float = 0.0
    section_distance_km: float = 0.0
    hist_avg_station_delay: float = 0.0
    hour_of_day: int = Field(default=12, ge=0, le=23)
    category: str = "Express"
    train_priority: int = 2
    coach_count: int = 0
    origin_dest_duration_min: float = 0.0
    junction_complexity: int = 1


@app.on_event("startup")
def load_models():
    global _bundle, _explainers

    if not MODEL_PATH.exists():
        print(f"WARNING: model not found at {MODEL_PATH}")
        print("Run `python train_model.py` inside ml-service first.")
        return

    _bundle = joblib.load(MODEL_PATH)
    _explainers = build_explainers(
        _bundle["classifier"],
        _bundle["quantile_models"],
    )
    print(f"Loaded {_bundle['model_version']} from {MODEL_PATH}")
    print("Features:", _bundle["feature_cols"])


def _prepare_row(req: PredictRequest) -> pd.DataFrame:
    if _bundle is None:
        raise HTTPException(status_code=503, detail="ML model is not loaded.")

    raw = req.model_dump()
    feature_cols = _bundle["feature_cols"]
    categorical_cols = _bundle["categorical_cols"]
    category_values = _bundle["category_values"]
    numeric_defaults = _bundle["numeric_defaults"]

    row = pd.DataFrame([{col: raw.get(col) for col in feature_cols}])

    for col in categorical_cols:
        value = row.at[0, col]
        if value is None or pd.isna(value):
            value = "__UNKNOWN__"
        value = str(value)
        allowed = category_values.get(col, [])
        if value not in allowed:
            value = "__UNKNOWN__"
        row[col] = pd.Categorical([value], categories=allowed)

    for col in feature_cols:
        if col in categorical_cols:
            continue
        row[col] = pd.to_numeric(row[col], errors="coerce")
        if pd.isna(row.at[0, col]):
            row.at[0, col] = numeric_defaults.get(col, 0.0)

    return row[feature_cols]


def _conditional_quantile_predictions(row: pd.DataFrame):
    result = {}
    for q, model in _bundle["quantile_models"].items():
        result[float(q)] = np.asarray(model.predict(row), dtype=float)
    return result


def _unconditional_quantiles(probability_delay: float, conditional_predictions):
    p = float(np.clip(probability_delay, 1e-6, 1.0))
    cond_qs = np.array(sorted(conditional_predictions.keys()), dtype=float)
    cond_values = np.array([conditional_predictions[q][0] for q in cond_qs], dtype=float)

    output = {}
    for desired in [0.05, 0.50, 0.95]:
        if desired <= 1.0 - p:
            value = 0.0
        else:
            alpha = (desired - (1.0 - p)) / p
            alpha = float(np.clip(alpha, cond_qs[0], cond_qs[-1]))
            value = float(np.interp(alpha, cond_qs, cond_values))
        output[desired] = max(0.0, value)

    output[0.50] = max(output[0.05], output[0.50])
    output[0.95] = max(output[0.50], output[0.95])
    return output


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_loaded": _bundle is not None,
        "model_version": _bundle.get("model_version") if _bundle else None,
    }


@app.get("/model-info")
def model_info():
    if _bundle is None:
        raise HTTPException(status_code=503, detail="ML model is not loaded.")
    return {
        "model_version": _bundle["model_version"],
        "metrics": _bundle.get("metrics", {}),
        "training_stats": _bundle.get("training_stats", {}),
        "feature_cols": _bundle["feature_cols"],
        "categorical_cols": _bundle["categorical_cols"],
    }


@app.post("/predict")
def predict(req: PredictRequest):
    if _bundle is None or _explainers is None:
        raise HTTPException(
            status_code=503,
            detail="Models not loaded. Run `python train_model.py` first.",
        )

    row = _prepare_row(req)

    # Stage 1: probability that the next-station delay is positive.
    probability_delay = float(_bundle["classifier"].predict_proba(row)[0, 1])

    # Stage 2: conditional delay magnitude given that a delay occurs.
    conditional = _conditional_quantile_predictions(row)
    unconditional = _unconditional_quantiles(probability_delay, conditional)

    p5 = round(unconditional[0.05], 1)
    p50 = round(unconditional[0.50], 1)
    p95 = round(unconditional[0.95], 1)

    # SHAP for positive-delay risk is the most useful explanation when the
    # model predicts an on-time outcome; otherwise explain the conditional P50.
    if p50 <= 0.0 and probability_delay < 0.50:
        factors = explain_row(_explainers["classifier"], row, top_k=6)
        explanation_target = "delay_probability"
    else:
        factors = explain_row(_explainers["p50"], row, top_k=6)
        explanation_target = "conditional_p50_delay"

    # Do not expose an internal helper field used only for sorting.
    for factor in factors:
        factor.pop("absolute_impact", None)

    return {
        "p5_minutes": p5,
        "p50_minutes": p50,
        "p95_minutes": p95,
        "delay_probability": round(probability_delay, 4),
        "delay_probability_percent": round(probability_delay * 100, 1),
        "zero_delay_probability_percent": round((1 - probability_delay) * 100, 1),
        "prediction_range": [p5, p95],
        "top_reason": build_reason(factors, probability_delay, p50),
        "shap": factors,
        "explanation_target": explanation_target,
        "model_source": "lightgbm-zero-inflated-quantile",
        "model_version": _bundle["model_version"],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
