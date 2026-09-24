import axios from "axios";
import Train from "../models/Train.js";
import LivePosition from "../models/LivePosition.js";
import DelayLog from "../models/DelayLog.js";
import Station from "../models/Station.js";
import TrainTrainingData from "../models/TrainTrainingData.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 2500);
const PREDICTION_CACHE_MS = Number(process.env.PREDICTION_CACHE_MS || 5000);
const HISTORY_CACHE_MS = Number(process.env.HISTORY_CACHE_MS || 15000);

const predictionCache = new Map();
const historyCache = new Map();

function getCached(cache, key, ttl) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > ttl) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(cache, key, value) {
  cache.set(key, { time: Date.now(), value });
  if (cache.size > 5000) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return value;
}

export function invalidatePrediction(trainNumber) {
  predictionCache.delete(String(trainNumber));
}

async function historicalAverage(filter, asOf) {
  const key = `hist:${filter.train_number || "*"}:${filter.station_code || "*"}`;
  const cached = getCached(historyCache, key, HISTORY_CACHE_MS);
  if (cached !== null) return cached;

  const trainingFilter = { logged_at: { $lt: asOf } };
  if (filter.train_number) trainingFilter.train_number = String(filter.train_number);
  if (filter.station_code) trainingFilter.last_station = String(filter.station_code);

  const docs = await TrainTrainingData.find(trainingFilter)
    .select("target_delay_at_next_station delay_minutes")
    .sort({ logged_at: -1 })
    .limit(200)
    .lean();

  if (docs.length) {
    const value = docs.reduce(
      (sum, d) => sum + Number(d.target_delay_at_next_station ?? d.delay_minutes ?? 0),
      0
    ) / docs.length;
    return setCached(historyCache, key, value);
  }

  const operational = await DelayLog.find({
    ...filter,
    logged_at: { $lt: asOf },
  })
    .select("delay_minutes")
    .sort({ logged_at: -1 })
    .limit(200)
    .lean();

  const value = operational.length
    ? operational.reduce((sum, d) => sum + Number(d.delay_minutes || 0), 0) / operational.length
    : 0;

  return setCached(historyCache, key, value);
}

async function precedingTrainDelay(stationCode, excludeTrainNumber, asOf) {
  const key = `preceding:${stationCode}:${excludeTrainNumber}`;
  const cached = getCached(historyCache, key, HISTORY_CACHE_MS);
  if (cached !== null) return cached;

  const recent = await DelayLog.findOne({
    station_code: stationCode,
    train_number: { $ne: excludeTrainNumber },
    logged_at: { $lt: asOf },
  })
    .select("delay_minutes")
    .sort({ logged_at: -1 })
    .lean();

  return setCached(historyCache, key, Number(recent?.delay_minutes || 0));
}

async function trackContentionCount(stationCode, asOf) {
  const key = `contention:${stationCode}`;
  const cached = getCached(historyCache, key, HISTORY_CACHE_MS);
  if (cached !== null) return cached;

  const hourAgo = new Date(asOf.getTime() - 60 * 60 * 1000);
  const value = await DelayLog.countDocuments({
    station_code: stationCode,
    logged_at: { $gte: hourAgo, $lt: asOf },
  });

  return setCached(historyCache, key, value);
}

export async function buildFeaturesForTrain(trainNumber) {
  const number = String(trainNumber);
  const [train, pos] = await Promise.all([
    Train.findOne({ train_number: number })
      .select("train_number train_name category train_priority route sections")
      .lean(),
    LivePosition.findOne({ train_number: number }).lean(),
  ]);

  if (!train || !pos || !Array.isArray(train.route) || train.route.length < 2) {
    return null;
  }

  const idx = Math.min(
    Math.max(Number(pos.route_idx || 0), 0),
    train.route.length - 2
  );

  const section = train.sections?.[idx] || {};
  const lastStation = train.route[idx];
  const nextStation = train.route[idx + 1];
  const asOf = new Date();

  const [station, latestTelemetry] = await Promise.all([
    Station.findOne({ code: lastStation })
      .select("code name lat lon junction_complexity")
      .lean(),
    // The CSV is also imported into MongoDB by scripts/importTrainingData.js.
    // Use the latest row for weather, historical station features and the
    // original dataset's distance/track values, while overriding live delay.
    TrainTrainingData.findOne({
      train_number: number,
      last_station: lastStation,
    })
      .sort({ logged_at: -1 })
      .lean(),
  ]);

  const history = Array.isArray(pos.delay_history) ? pos.delay_history : [];
  const trend = history.length > 1
    ? (Number(history.at(-1)) - Number(history[0])) / Math.max(history.length - 1, 1)
    : Number(latestTelemetry?.delay_trend_last3 || 0);

  const [histTrainStation, histStation, precedingDelay, contention] = await Promise.all([
    historicalAverage({ train_number: number, station_code: lastStation }, asOf),
    historicalAverage({ station_code: lastStation }, asOf),
    precedingTrainDelay(lastStation, number, asOf),
    trackContentionCount(lastStation, asOf),
  ]);

  const scheduledMinutes = Number(
    section.scheduled_minutes ||
    Math.max(
      10,
      Math.round(
        Number(section.distance_km || latestTelemetry?.section_distance_km || 0) /
        Math.max(Number(section.sched_speed_kmh || latestTelemetry?.sched_speed_kmh || 1), 1) * 60
      )
    )
  );

  const features = {
    train_number: number,
    last_station: lastStation,
    station_name: station?.name || latestTelemetry?.station_name || lastStation,
    next_station: nextStation,
    delay_minutes: Math.max(0, Number(pos.delay_minutes || 0)),
    // distance_km in the training CSV represents the train's distance marker.
    distance_km: Number(latestTelemetry?.distance_km ?? section.distance_km ?? 0),
    latitude: Number(latestTelemetry?.latitude ?? station?.lat ?? 0),
    longitude: Number(latestTelemetry?.longitude ?? station?.lon ?? 0),
    precipitation_sum: Number(latestTelemetry?.precipitation_sum || 0),
    is_fog_day: Number(latestTelemetry?.is_fog_day || 0),
    delay_trend_last3: trend,
    track_type: latestTelemetry?.track_type || section.track_type || "Unknown",
    level_crossings: Number(latestTelemetry?.level_crossings ?? section.level_crossings ?? 0),
    is_ghat: Number(latestTelemetry?.is_ghat ?? section.is_ghat ?? 0),
    sched_speed_kmh: Number(latestTelemetry?.sched_speed_kmh ?? section.sched_speed_kmh ?? 0),
    section_distance_km: Number(latestTelemetry?.section_distance_km ?? section.distance_km ?? 0),
    hist_avg_station_delay: Number(latestTelemetry?.hist_avg_station_delay ?? histStation ?? 0),
    hour_of_day: asOf.getHours(),
    category: train.category || latestTelemetry?.category || "Express",
    train_priority: Number(train.train_priority ?? latestTelemetry?.train_priority ?? 2),
    coach_count: Number(latestTelemetry?.coach_count ?? 0),
    origin_dest_duration_min: Number(latestTelemetry?.origin_dest_duration_min ?? 0),
    junction_complexity: Number(
      station?.junction_complexity ?? latestTelemetry?.junction_complexity ?? 1
    ),
  };

  return {
    features,
    meta: {
      train_number: number,
      last_station: lastStation,
      next_station: nextStation,
      train_name: train.train_name,
      scheduled_minutes: scheduledMinutes,
      route_index: idx,
      historical_train_station_delay: Number(histTrainStation || 0),
      historical_station_delay: Number(histStation || 0),
      preceding_train_delay: Number(precedingDelay || 0),
      track_contention_count: Number(contention || 0),
    },
  };
}

function statisticalFallback(built) {
  const live = Math.max(0, Number(built.features.delay_minutes || 0));
  const hist = Math.max(0, Number(built.features.hist_avg_station_delay || 0));
  const trend = Number(built.features.delay_trend_last3 || 0);
  const contention = Math.min(10, Number(built.meta.track_contention_count || 0));

  const p50 = Math.max(
    0,
    Math.round(
      (live * 0.65 + hist * 0.20 + trend * 0.5 + contention * 0.4) * 10
    ) / 10
  );
  const spread = Math.max(5, Math.round(5 + contention * 0.5 + Math.abs(trend)));

  return {
    p5_minutes: Math.max(0, Math.round((p50 - spread) * 10) / 10),
    p50_minutes: p50,
    p95_minutes: Math.round((p50 + spread * 1.5) * 10) / 10,
    delay_probability_percent: null,
    shap: [],
    top_reason: "ML service unavailable; statistical fallback uses live delay, historical patterns, recent trend and track contention.",
    model_source: "statistical-fallback",
    ...built.meta,
  };
}

export async function predictForTrain(trainNumber) {
  const number = String(trainNumber);
  const cached = getCached(predictionCache, number, PREDICTION_CACHE_MS);
  if (cached !== null) return cached;

  const built = await buildFeaturesForTrain(number);
  if (!built) return null;

  try {
    const resp = await axios.post(`${ML_SERVICE_URL}/predict`, built.features, {
      timeout: ML_TIMEOUT_MS,
    });
    return setCached(predictionCache, number, { ...resp.data, ...built.meta });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[prediction] ML service unavailable for ${number}: ${error.message}`);
    }
    return setCached(predictionCache, number, statisticalFallback(built));
  }
}

export async function predictForTrains(trainNumbers, concurrency = 6) {
  const unique = [...new Set((trainNumbers || []).map(String))];
  const output = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const index = cursor++;
      const number = unique[index];
      try {
        output.set(number, await predictForTrain(number));
      } catch (error) {
        console.error(`[prediction] ${number} failed:`, error.message);
        output.set(number, null);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), unique.length || 1) },
    () => worker()
  );
  await Promise.all(workers);

  return output;
}
