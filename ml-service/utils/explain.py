"""SHAP explanations for the Railway Delay Intelligence models."""

from __future__ import annotations

import numpy as np
import pandas as pd
import shap

FEATURE_LABELS = {
    "delay_minutes": "Current delay",
    "delay_trend_last3": "Recent delay trend",
    "hist_avg_station_delay": "Historical station delay",
    "precipitation_sum": "Rain / precipitation",
    "is_fog_day": "Fog condition",
    "distance_km": "Distance already travelled",
    "section_distance_km": "Next section distance",
    "sched_speed_kmh": "Scheduled section speed",
    "level_crossings": "Level crossings",
    "is_ghat": "Ghat / hill section",
    "junction_complexity": "Junction complexity",
    "hour_of_day": "Time of day",
    "category": "Train category",
    "train_priority": "Train priority",
    "coach_count": "Coach count",
    "origin_dest_duration_min": "Journey duration",
    "latitude": "Current latitude",
    "longitude": "Current longitude",
    "train_number": "Train identity / historical pattern",
    "last_station": "Current station pattern",
    "station_name": "Station pattern",
    "next_station": "Next station pattern",
    "track_type": "Track type",
}


def build_explainers(classifier, quantile_models):
    """Build TreeExplainer objects once at FastAPI startup."""
    return {
        "classifier": shap.TreeExplainer(classifier),
        "p50": shap.TreeExplainer(quantile_models[0.50]),
    }


def _as_2d_shap_values(explainer, row_df: pd.DataFrame) -> np.ndarray:
    values = explainer.shap_values(row_df)

    # SHAP versions differ for binary classifiers: some return a list for the
    # two classes, newer versions may return a 3-D array. We always select the
    # positive-delay class.
    if isinstance(values, list):
        values = values[-1]
    values = np.asarray(values)
    if values.ndim == 3:
        values = values[:, :, -1]
    if values.ndim == 1:
        values = values.reshape(1, -1)
    return values


def _display_value(value):
    if pd.isna(value):
        return "missing"
    if isinstance(value, (np.integer, int)):
        return str(int(value))
    if isinstance(value, (np.floating, float)):
        return f"{float(value):.2f}"
    return str(value)


def explain_row(explainer, row_df: pd.DataFrame, top_k: int = 6):
    values = _as_2d_shap_values(explainer, row_df)[0]
    features = list(row_df.columns)

    items = []
    for feature, impact in zip(features, values):
        numeric_impact = float(impact)
        items.append({
            "feature": feature,
            "label": FEATURE_LABELS.get(feature, feature.replace("_", " ").title()),
            "value": _display_value(row_df.iloc[0][feature]),
            "impact": round(numeric_impact, 3),
            "direction": "increases" if numeric_impact >= 0 else "reduces",
            "absolute_impact": abs(numeric_impact),
        })

    items.sort(key=lambda x: x["absolute_impact"], reverse=True)
    for item in items:
        item.pop("absolute_impact", None)
    return items[:top_k]


def build_reason(top_factors, probability_delay: float, p50: float) -> str:
    if not top_factors:
        return "No explanation was available for this prediction."

    # For a delayed prediction, prefer a factor that actually pushes the
    # prediction upward. This makes the plain-language reason more useful
    # than simply choosing the largest absolute SHAP value.
    positive = [item for item in top_factors if item["impact"] > 0]
    main = positive[0] if positive else top_factors[0]
    chance = round(probability_delay * 100)

    if p50 <= 0.0 and probability_delay < 0.50:
        return (
            f"The model estimates about a {chance}% chance of a positive delay. "
            f"The strongest risk signal is {main['label']}, which {main['direction']} the predicted delay risk."
        )

    return (
        f"The main upward risk signal is {main['label']}, which "
        f"{main['direction']} the expected delay."
    )
