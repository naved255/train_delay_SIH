"""
Train the Railway Delay Intelligence model from backend/data/train_data.csv.

Architecture
------------
1. LightGBM binary classifier: P(delay at next station > 0)
2. LightGBM conditional quantile regressors: delay magnitude GIVEN a delay
3. Mixture quantile calculation converts those models into unconditional P5/P50/P95

This is deliberately a two-stage model because the supplied dataset is highly
zero-inflated (~60-80% of rows have zero delay). Training ordinary quantile
regressors directly on this target makes the zero mass dominate the useful delay
magnitude signal.

Run from this directory:
    python train_model.py

Output:
    ml-service/models/lgbm_railway_delay.joblib
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR.parent / "backend" / "data" / "train_data.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "lgbm_railway_delay.joblib"

TARGET = "target_delay_at_next_station"

# Columns that are identifiers / raw timestamps / constants in the supplied CSV.
# The training script also removes any other constant columns automatically.
DROP_COLS = {
    TARGET,
    "logged_at",
    "journey_date",
    "actual_station_date",
    "scheduled_arrival",
    "scheduled_departure",
    "hist_avg_train_station_delay",  # constant in the supplied CSV
    "day_of_week",                    # constant in the supplied CSV
    "is_weekend",                     # constant in the supplied CSV
    "is_festival_season",             # constant in the supplied CSV
}

BASE_CATEGORICAL = [
    "train_number",
    "last_station",
    "station_name",
    "next_station",
    "track_type",
    "category",
]

CONDITIONAL_QUANTILES = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
OUTPUT_QUANTILES = [0.05, 0.50, 0.95]


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    if TARGET not in df.columns:
        raise ValueError(f"Missing target column: {TARGET}")

    # Normalize the target and remove impossible negative labels.
    df[TARGET] = pd.to_numeric(df[TARGET], errors="coerce").fillna(0).clip(lower=0)

    # LightGBM can handle NaNs, but making infinities explicit prevents surprises.
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].replace([np.inf, -np.inf], np.nan)

    # Fill categorical values with an explicit token so inference has the same schema.
    for col in BASE_CATEGORICAL:
        if col in df.columns:
            df[col] = df[col].fillna("__MISSING__").astype(str)

    return df


def choose_features(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    candidates = [c for c in df.columns if c not in DROP_COLS]

    # Drop constants. This is important for the current one-day prototype data,
    # where several columns have exactly one value.
    features = [c for c in candidates if df[c].nunique(dropna=False) > 1]

    # Keep only categorical columns that actually exist in the final feature set.
    categorical = [c for c in BASE_CATEGORICAL if c in features]

    # train_number is an operational categorical key, not a continuous quantity.
    if "train_number" in features and "train_number" not in categorical:
        categorical.append("train_number")

    return features, categorical


def prepare_features(df: pd.DataFrame, feature_cols: list[str], categorical_cols: list[str]):
    x = df[feature_cols].copy()

    for col in categorical_cols:
        x[col] = x[col].fillna("__MISSING__").astype(str)

    for col in feature_cols:
        if col not in categorical_cols:
            x[col] = pd.to_numeric(x[col], errors="coerce")

    # Stable category dictionaries are stored in the artifact for inference.
    category_values: dict[str, list[str]] = {}
    for col in categorical_cols:
        values = sorted(x[col].dropna().astype(str).unique().tolist())
        if "__UNKNOWN__" not in values:
            values.append("__UNKNOWN__")
        category_values[col] = values
        x[col] = pd.Categorical(x[col], categories=values)

    numeric_defaults = {}
    for col in feature_cols:
        if col not in categorical_cols:
            median = float(x[col].median()) if x[col].notna().any() else 0.0
            numeric_defaults[col] = median
            x[col] = x[col].fillna(median)

    return x, category_values, numeric_defaults


def build_model(name: str, alpha: float | None = None):
    common = dict(
        n_estimators=350,
        learning_rate=0.035,
        num_leaves=31,
        max_depth=-1,
        min_child_samples=25,
        subsample=0.90,
        colsample_bytree=0.90,
        reg_alpha=0.05,
        reg_lambda=0.20,
        random_state=42,
        n_jobs=-1,
        verbosity=-1,
    )

    if name == "classifier":
        return lgb.LGBMClassifier(
            objective="binary",
            **common,
        )

    return lgb.LGBMRegressor(
        objective="quantile",
        alpha=alpha,
        **common,
    )


def unconditional_quantiles(
    probability_delay: np.ndarray,
    conditional_predictions: dict[float, np.ndarray],
    desired_quantiles: list[float],
) -> dict[float, np.ndarray]:
    """Convert P(delay>0) + conditional quantiles into unconditional quantiles.

    If p = P(Y>0), there is a point mass of (1-p) at zero. For q > 1-p:

        conditional_alpha = (q - (1-p)) / p

    The conditional model is trained on positive-delay rows only. We interpolate
    between its stored quantiles to estimate the required alpha.
    """
    p = np.clip(np.asarray(probability_delay, dtype=float), 1e-6, 1.0)
    cond_qs = np.array(sorted(conditional_predictions.keys()), dtype=float)
    cond_matrix = np.vstack([conditional_predictions[q] for q in cond_qs]).T

    output = {}
    for q in desired_quantiles:
        alpha = (q - (1.0 - p)) / p
        result = np.zeros_like(p, dtype=float)
        mask = q > (1.0 - p)
        if np.any(mask):
            alpha_m = np.clip(alpha[mask], cond_qs[0], cond_qs[-1])
            result[mask] = np.array(
                [np.interp(alpha_m[i], cond_qs, cond_matrix[mask][i]) for i in range(len(alpha_m))]
            )
        output[q] = np.maximum(result, 0.0)

    # Numerical guard: quantile ordering must never be inverted.
    output[0.50] = np.maximum(output[0.50], output[0.05])
    output[0.95] = np.maximum(output[0.95], output[0.50])
    return output


def main():
    print("=" * 72)
    print("RAILWAY DELAY INTELLIGENCE — LIGHTGBM TRAINING")
    print("=" * 72)
    print(f"Dataset: {DATA_PATH}")

    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training CSV not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)
    print(f"Rows: {len(df):,} | Columns: {len(df.columns)}")

    df = clean_dataframe(df)
    zero_rate = float((df[TARGET] == 0).mean())
    positive_rate = 1.0 - zero_rate
    print(f"Zero-delay target rate: {zero_rate:.1%}")
    print(f"Positive-delay target rate: {positive_rate:.1%}")

    feature_cols, categorical_cols = choose_features(df)
    X, category_values, numeric_defaults = prepare_features(
        df, feature_cols, categorical_cols
    )
    y = df[TARGET].astype(float)

    print("\nFeatures:")
    print("  " + ", ".join(feature_cols))
    print("Categorical:")
    print("  " + ", ".join(categorical_cols))

    # Group split prevents rows from the same train from being scattered into both
    # train and test sets. This is more honest for railway telemetry than a random row split.
    groups = df["train_number"].astype(str) if "train_number" in df.columns else np.arange(len(df))
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    train_idx, test_idx = next(splitter.split(X, y, groups=groups))

    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

    y_train_delay = (y_train > 0).astype(int)
    y_test_delay = (y_test > 0).astype(int)

    # ------------------------------------------------------------------
    # Stage 1: zero vs positive delay classifier
    # ------------------------------------------------------------------
    print("\n[1/2] Training LightGBM delay-probability classifier...")
    classifier = build_model("classifier")
    classifier.fit(
        X_train,
        y_train_delay,
        categorical_feature=categorical_cols,
    )

    p_test = classifier.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test_delay, p_test) if len(np.unique(y_test_delay)) == 2 else float("nan")
    print(f"  ROC-AUC: {auc:.4f}")

    # ------------------------------------------------------------------
    # Stage 2: conditional positive-delay quantile regressors
    # ------------------------------------------------------------------
    print("\n[2/2] Training LightGBM conditional quantile regressors...")
    positive_train = y_train > 0
    X_train_positive = X_train.loc[positive_train]
    y_train_positive = y_train.loc[positive_train]

    quantile_models: dict[float, lgb.LGBMRegressor] = {}
    conditional_test_predictions: dict[float, np.ndarray] = {}

    for alpha in CONDITIONAL_QUANTILES:
        print(f"  Training conditional q={alpha:.2f}...")
        model = build_model("quantile", alpha=alpha)
        model.fit(
            X_train_positive,
            y_train_positive,
            categorical_feature=categorical_cols,
        )
        quantile_models[alpha] = model
        conditional_test_predictions[alpha] = model.predict(X_test)

    # Convert the two-stage predictions to unconditional P5/P50/P95.
    unconditional_test = unconditional_quantiles(
        p_test,
        conditional_test_predictions,
        OUTPUT_QUANTILES,
    )

    p5 = unconditional_test[0.05]
    p50 = unconditional_test[0.50]
    p95 = unconditional_test[0.95]
    coverage = float(np.mean((y_test.values >= p5) & (y_test.values <= p95)))

    print("\nEvaluation on held-out trains")
    print(f"  P50 MAE:      {mean_absolute_error(y_test, p50):.2f} min")
    print(f"  P50 RMSE:     {mean_squared_error(y_test, p50) ** 0.5:.2f} min")
    print(f"  P5-P95 cover: {coverage:.1%}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    bundle = {
        "model_version": "railway-delay-lgbm-v2-zero-inflated",
        "classifier": classifier,
        "quantile_models": quantile_models,
        "feature_cols": feature_cols,
        "categorical_cols": categorical_cols,
        "category_values": category_values,
        "numeric_defaults": numeric_defaults,
        "conditional_quantiles": CONDITIONAL_QUANTILES,
        "output_quantiles": OUTPUT_QUANTILES,
        "metrics": {
            "roc_auc": None if np.isnan(auc) else float(auc),
            "p50_mae_minutes": float(mean_absolute_error(y_test, p50)),
            "p50_rmse_minutes": float(mean_squared_error(y_test, p50) ** 0.5),
            "p5_p95_coverage": coverage,
        },
        "training_stats": {
            "rows": int(len(df)),
            "train_rows": int(len(train_idx)),
            "test_rows": int(len(test_idx)),
            "zero_delay_rate": zero_rate,
            "positive_delay_rate": positive_rate,
            "positive_train_rows": int(positive_train.sum()),
            "unique_trains": int(df["train_number"].nunique()) if "train_number" in df.columns else None,
        },
    }

    joblib.dump(bundle, MODEL_PATH, compress=3)

    metrics_path = MODEL_DIR / "metrics.json"
    metrics_path.write_text(json.dumps({
        "model_version": bundle["model_version"],
        "metrics": bundle["metrics"],
        "training_stats": bundle["training_stats"],
        "features": feature_cols,
        "categorical_features": categorical_cols,
    }, indent=2), encoding="utf-8")

    print(f"\nSaved model bundle: {MODEL_PATH}")
    print(f"Saved metrics:      {metrics_path}")
    print("Training complete.")


if __name__ == "__main__":
    main()
