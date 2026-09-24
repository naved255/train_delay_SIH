"""
Generates a simulated but FEATURE-REALISTIC training dataset -- delay is a
function of section/journey/category characteristics plus noise, not pure
randomness, so the model has real signal to learn from.
"""
import numpy as np
import pandas as pd

STATIONS = [
    "NDLS", "GZB", "MB", "BE", "CNB", "ALD", "MGS", "PNBE", "DNR", "HWH",
    "BSL", "JL", "MMR", "NK", "PUNE", "SUR", "MA", "KWV", "SBC", "MAS",
]

CATEGORIES = ["Passenger", "Express", "Superfast"]
CATEGORY_WEIGHTS = [0.3, 0.45, 0.25]


def _section_props(rng):
    return {
        "distance_km": float(rng.uniform(15, 90)),
        "sched_speed_kmh": float(rng.uniform(35, 110)),
        "level_crossings": int(rng.integers(0, 4)),
        "is_ghat": int(rng.random() < 0.08),
        "junction_complexity": int(rng.integers(1, 4)),
    }


def simulate_delay(section, route_idx, route_len, category, hour, rng):
    base = 5.0
    if section["is_ghat"]:
        base += 20
    base += section["level_crossings"] * 3
    base += (route_idx / max(route_len - 1, 1)) * 15
    if category == "Passenger":
        base += 10
    elif category == "Express":
        base += 4
    if hour in (7, 8, 9, 18, 19, 20):
        base += 6
    noise = rng.normal(0, 9)
    delay = max(0, base + noise)
    if rng.random() < 0.08:
        delay += rng.uniform(25, 80)
    return round(delay, 1)


def generate_training_dataframe(n_trains=40, journeys_per_train=25, seed=42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []

    for train_idx in range(n_trains):
        category = rng.choice(CATEGORIES, p=CATEGORY_WEIGHTS)
        priority = {"Superfast": 1, "Express": 2, "Passenger": 4}[category]
        route_len = int(rng.integers(6, 16))
        route = list(rng.choice(STATIONS, size=route_len, replace=False))
        sections = [_section_props(rng) for _ in range(route_len - 1)]

        train_station_hist = {}
        station_hist = {}

        for journey in range(journeys_per_train):
            hour = int(rng.integers(0, 24))
            day_of_week = int(rng.integers(0, 7))
            prev_delay = 0.0
            delay_history = []

            for idx in range(route_len - 1):
                sec = sections[idx]
                last_station, next_station = route[idx], route[idx + 1]

                delay = simulate_delay(sec, idx, route_len, category, hour, rng)

                key_ts = (train_idx, last_station)
                hist_ts_vals = train_station_hist.get(key_ts, [])
                hist_avg_train_station = float(np.mean(hist_ts_vals)) if hist_ts_vals else 0.0

                hist_s_vals = station_hist.get(last_station, [])
                hist_avg_station = float(np.mean(hist_s_vals)) if hist_s_vals else 0.0

                delay_history.append(delay)
                trend = float(np.mean(np.diff(delay_history[-4:]))) if len(delay_history) > 1 else 0.0

                rows.append({
                    "delay_minutes": prev_delay,
                    "delay_trend_last3": trend,
                    "hist_avg_train_station_delay": hist_avg_train_station,
                    "hist_avg_station_delay": hist_avg_station,
                    "track_contention_count": int(rng.integers(0, 5)),
                    "preceding_train_delay": float(rng.choice([0, 0, 5, 10, 15, 30])),
                    "stations_remaining": route_len - idx - 1,
                    "distance_km": sec["distance_km"],
                    "sched_speed_kmh": sec["sched_speed_kmh"],
                    "level_crossings": sec["level_crossings"],
                    "is_ghat": sec["is_ghat"],
                    "junction_complexity": sec["junction_complexity"],
                    "hour_of_day": hour,
                    "day_of_week": day_of_week,
                    "is_weekend": int(day_of_week in (5, 6)),
                    "category": category,
                    "train_priority": priority,
                    "target_delay_at_next_station": delay,
                })

                train_station_hist.setdefault(key_ts, []).append(delay)
                station_hist.setdefault(last_station, []).append(delay)
                prev_delay = delay

    return pd.DataFrame(rows)
