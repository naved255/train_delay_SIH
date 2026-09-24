# Railway Delay Intelligence System — SIH Prototype

This project contains the React passenger/operations dashboards, Node/Express API, MongoDB data layer, and a FastAPI + LightGBM ML service.

## ML pipeline

The ML service now trains directly from:

`backend/data/train_data.csv`

The supplied CSV is strongly zero-inflated: approximately 78.9% of the target values are zero. Instead of allowing those zeros to dominate a single regression model, the pipeline uses a two-stage LightGBM design:

1. **Delay classifier** — estimates `P(target_delay_at_next_station > 0)`.
2. **Conditional LightGBM quantile regressors** — trained only on positive-delay rows at q=0.05, 0.10, 0.25, 0.50, 0.75, 0.90 and 0.95.
3. The two outputs are combined into unconditional **P5 / P50 / P95** delay estimates using the zero-delay probability mass.
4. **SHAP TreeExplainer** explains the current prediction and returns the strongest contributing features.

This approach keeps `P5/P50/P95` interpretable while explicitly modelling the large on-time/zero-delay population.

## Training

Open a terminal in `ml-service`:

```bash
cd ml-service
python -m venv venv
# Windows
venv\\Scripts\\activate
# macOS/Linux
# source venv/bin/activate

pip install -r requirements.txt
python train_model.py
```

Training creates:

- `ml-service/models/lgbm_railway_delay.joblib` — classifier + seven conditional quantile models + feature schema.
- `ml-service/models/metrics.json` — held-out evaluation metrics and training statistics.

The current supplied CSV produced the following held-out results during implementation:

- 20,086 rows
- 78.9% zero-delay target rate
- Grouped train-level holdout
- ROC-AUC: about 0.9995
- P50 MAE: about 1.87 minutes
- P5–P95 coverage: about 92.1%

These metrics describe the supplied prototype dataset only. They should not be presented as performance on official Indian Railways telemetry.

## Start the ML service

```bash
cd ml-service
uvicorn main:app --reload --port 8000
```

Endpoints:

- `GET /health`
- `GET /model-info`
- `POST /predict`

Example prediction response contains:

```json
{
  "p5_minutes": 5.0,
  "p50_minutes": 16.9,
  "p95_minutes": 22.8,
  "delay_probability_percent": 100.0,
  "top_reason": "...",
  "shap": [
    {
      "feature": "delay_minutes",
      "label": "Current delay",
      "value": "18.00",
      "impact": 2.1,
      "direction": "increases"
    }
  ],
  "model_source": "lightgbm-zero-inflated-quantile"
}
```

## Backend integration

Node/Express calls the ML service through:

`backend/services/predictionService.js`

For a selected train, the backend combines:

- live delay and delay history from `LivePosition`
- train/route/section information from MongoDB
- latest weather/telemetry fields from `TrainTrainingData`
- historical station delay statistics
- LightGBM prediction
- SHAP explanation

The backend endpoint is:

`GET /api/trains/:trainNumber/predict`

The existing `GET /api/trains/:trainNumber/live` also exposes the SHAP and ML fields.

The Passenger dashboard now shows:

- P5 optimistic delay
- P50 expected delay
- P95 worst-case delay
- probability of a positive delay
- plain-language explanation
- top SHAP factors with positive/negative impact bars

The first upcoming-station row in the forecast also uses the ML P50 prediction and exposes its delay range.

## Full local startup

### 1. Backend

Create `backend/.env` from `backend/.env.example` and set your MongoDB connection and JWT secret.

```bash
cd backend
npm install
npm run dev
```

Backend: `http://localhost:5000`

### 2. ML service

```bash
cd ml-service
python -m venv venv
venv\\Scripts\\activate
pip install -r requirements.txt
python train_model.py
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Important data note

The current simulator generates synthetic live telemetry. The ML training CSV is also prototype/synthetic data. For an SIH demo, describe this accurately and show the architecture as ready to replace the simulator and prototype weather fields with authorized railway telemetry and production weather feeds.

## Main architecture

```text
train_data.csv
     |
     v
Data cleaning + schema detection
     |
     +--------------------------+
     |                          |
     v                          v
LightGBM delay classifier    Positive-delay rows
P(delay > 0)                  |
                              +--> q05 q10 q25 q50 q75 q90 q95
     |                          |
     +------------+-------------+
                  |
                  v
        Zero-inflated quantiles
             P5 / P50 / P95
                  |
                  +----> SHAP TreeExplainer
                  |
                  v
        FastAPI /predict response
                  |
                  v
       Node/Express prediction service
                  |
                  v
       Passenger / Staff / Feeder /
             Control Room views
```
