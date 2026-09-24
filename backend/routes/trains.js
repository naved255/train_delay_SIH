import express from "express";
import Train from "../models/Train.js";
import Station from "../models/Station.js";
import LivePosition from "../models/LivePosition.js";
import TrainTrainingData from "../models/TrainTrainingData.js";
import { predictForTrain } from "../services/predictionService.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticateToken);

function toTrainDto(train, pos, prediction, stationMap) {
  const idx = Math.min(Math.max(pos.route_idx, 0), train.route.length - 1);
  const routeCoordinates = train.route.map((code) => [stationMap[code]?.lat, stationMap[code]?.lon])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  const current = stationMap[train.route[idx]];
  const next = stationMap[train.route[Math.min(idx + 1, train.route.length - 1)]];
  const p50 = Number(prediction?.p50_minutes || 0);
  const scheduled = Number(prediction?.scheduled_minutes || 0);
  const eta = new Date(Date.now() + Math.max(1, scheduled + p50) * 60000);

  return {
    id: train.train_number,
    trainNumber: train.train_number,
    trainName: train.train_name,
    category: train.category,
    status: pos.delay_minutes > 30 ? "Heavy Delay" : pos.delay_minutes > 10 ? "Delayed" : "On Time",
    currentDelay: Math.round(pos.delay_minutes || 0),
    speed: Math.max(0, Math.round((train.sections[idx]?.sched_speed_kmh || 60) * (pos.delay_minutes > 30 ? 0.65 : 0.9))),
    currentLocation: (current && Number.isFinite(Number(current.lat)) && Number.isFinite(Number(current.lon)))
          ? { coordinates: [Number(current.lon), Number(current.lat)] }
          : null,
    currentStation: current?.name || train.route[idx],
    nextStation: next?.name || train.route[Math.min(idx + 1, train.route.length - 1)],
    nextStationCode: train.route[Math.min(idx + 1, train.route.length - 1)],
    predictedETA: eta.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) + " IST",
    etaIso: eta.toISOString(),
    etaRange: prediction ? [Math.round(scheduled + prediction.p5_minutes), Math.round(scheduled + prediction.p95_minutes)] : null,
    mlConfidence: prediction?.model_source === "statistical-fallback" ? 60 : 90,
    modelSource: prediction?.model_source || "ML service",
    topReason: prediction?.top_reason,
    delayProbability: prediction?.delay_probability_percent ?? null,
    predictionRange: prediction ? [prediction.p5_minutes, prediction.p95_minutes] : null,
    shap: prediction?.shap || [],
    modelVersion: prediction?.model_version || null,
    routeCoordinates,
    route: train.route.map((code) => ({ code, name: stationMap[code]?.name, lat: stationMap[code]?.lat, lon: stationMap[code]?.lon })),
    updatedAt: pos.updated_at,
  };
}

router.get("/", async (_req, res) => {
  const trains = await Train.find({}, "train_number train_name category route train_priority");
  res.json(trains);
});

router.get("/running", async (req, res) => {
  const startedAt = Date.now();
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    // IMPORTANT: This endpoint is intentionally a lightweight read endpoint.
    // Do not call the ML service once per train here. The passenger dashboard
    // polls this endpoint every few seconds, so doing N predictions per poll
    // makes the API unstable at Indian-Railways-sized data volumes.
    const [trains, total] = await Promise.all([
      Train.find({})
        .select("train_number train_name category route train_priority sections")
        .sort({ train_number: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Train.countDocuments({}),
    ]);

    if (!trains.length) {
      return res.json({ data: [], total, limit, skip, hasMore: false });
    }

    const trainNumbers = trains.map((t) => String(t.train_number));
    const stationCodes = [...new Set(trains.flatMap((t) => t.route || []))];

    const [positions, stations, trainHistory] = await Promise.all([
      LivePosition.find({ train_number: { $in: trainNumbers } }).lean(),
      Station.find({ code: { $in: stationCodes } }).lean(),
      // One bounded aggregation instead of one historical query per train.
      TrainTrainingData.aggregate([
        { $match: { train_number: { $in: trainNumbers } } },
        { $group: {
          _id: "$train_number",
          avgDelay: { $avg: "$target_delay_at_next_station" },
          avgStationDelay: { $avg: "$hist_avg_station_delay" },
          samples: { $sum: 1 },
        } },
      ]),
    ]);

    const positionMap = Object.fromEntries(positions.map((p) => [String(p.train_number), p]));
    const stationMap = Object.fromEntries(stations.map((s) => [s.code, s]));
    const trainHistoryMap = Object.fromEntries(trainHistory.map((x) => [String(x._id), {
      avgDelay: Number(x.avgDelay || 0),
      avgStationDelay: Number(x.avgStationDelay || 0),
    }]));

    const now = Date.now();
    const result = trains.map((train) => {
      const pos = positionMap[String(train.train_number)];
      if (!pos) return null;

      const idx = Math.min(Math.max(Number(pos.route_idx || 0), 0), Math.max(train.route.length - 2, 0));
      const section = train.sections?.[idx] || {};
      const lastStation = train.route?.[idx];
      const nextCode = train.route?.[Math.min(idx + 1, train.route.length - 1)];
      const current = stationMap[lastStation];
      const next = stationMap[nextCode];

      const scheduledMinutes = Number(
        section.scheduled_minutes ||
        Math.max(10, Math.round(Number(section.distance_km || 0) / Math.max(Number(section.sched_speed_kmh || 1), 1) * 60))
      );
      const history = Array.isArray(pos.delay_history) ? pos.delay_history : [];
      const trend = history.length > 1
        ? (Number(history.at(-1) || 0) - Number(history[0] || 0)) / Math.max(history.length - 1, 1)
        : 0;
      const liveDelay = Math.max(0, Number(pos.delay_minutes || 0));
      const historyStats = trainHistoryMap[String(train.train_number)] || { avgDelay: 0, avgStationDelay: 0 };
      const trainHist = Math.max(0, historyStats.avgDelay);
      const stationHist = Math.max(0, historyStats.avgStationDelay);
      const predictedDelay = Math.max(
        0,
        Math.round((liveDelay * 0.60 + trainHist * 0.25 + stationHist * 0.10 + Math.max(-2, Math.min(2, trend)) * 0.05) * 10) / 10
      );
      const eta = new Date(now + Math.max(1, scheduledMinutes + predictedDelay) * 60000);

      const routeCoordinates = (train.route || [])
        .map((code) => [stationMap[code]?.lat, stationMap[code]?.lon])
        .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

      return {
        id: String(train.train_number),
        trainNumber: String(train.train_number),
        trainName: train.train_name || `Train ${train.train_number}`,
        category: train.category,
        status: liveDelay > 30 ? "Heavy Delay" : liveDelay > 10 ? "Delayed" : "On Time",
        currentDelay: Math.round(liveDelay),
        speed: Math.max(0, Math.round((Number(section.sched_speed_kmh) || 60) * (liveDelay > 30 ? 0.65 : 0.9))),
        currentLocation: (current && Number.isFinite(Number(current.lat)) && Number.isFinite(Number(current.lon)))
          ? { coordinates: [Number(current.lon), Number(current.lat)] }
          : null,
        currentStation: current?.name || lastStation || "Unknown",
        nextStation: next?.name || nextCode || "Destination",
        nextStationCode: nextCode,
        predictedETA: eta.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) + " IST",
        etaIso: eta.toISOString(),
        etaRange: [
          Math.max(0, Math.round(scheduledMinutes + predictedDelay - 5)),
          Math.round(scheduledMinutes + predictedDelay + 8),
        ],
        mlConfidence: 70,
        modelSource: "historical-statistical",
        topReason: "ETA combines current live delay with historical train/station delay patterns and recent delay trend.",
        routeCoordinates,
        route: (train.route || []).map((code) => ({ code, name: stationMap[code]?.name, lat: stationMap[code]?.lat, lon: stationMap[code]?.lon })),
        updatedAt: pos.updated_at,
      };
    }).filter(Boolean);

    console.log(`[GET /api/trains/running] ${result.length}/${total} trains in ${Date.now() - startedAt}ms`);
    res.json({ data: result, total, limit, skip, hasMore: skip + limit < total });
  } catch (err) {
    console.error("[GET /api/trains/running] failed:", err);
    res.status(500).json({
      message: "Unable to load running trains.",
      detail: process.env.NODE_ENV === "production" ? undefined : err.message,
    });
  }
});

router.get("/:trainNumber/forecast", async (req, res) => {
  try {
    const train = await Train.findOne({ train_number: req.params.trainNumber });
    const pos = await LivePosition.findOne({ train_number: req.params.trainNumber });
    if (!train || !pos) return res.status(404).json({ message: "Train not found." });

    const stations = await Station.find({ code: { $in: train.route } });
    const stationMap = Object.fromEntries(stations.map((station) => [station.code, station]));
    const startIdx = Math.min(Math.max(pos.route_idx, 0), Math.max(train.route.length - 2, 0));
    const mlPrediction = await predictForTrain(req.params.trainNumber);
    let accumulatedMinutes = 0;
    const rows = [];

    for (let i = startIdx; i < train.route.length - 1; i += 1) {
      const section = train.sections[i] || {};
      const sectionMinutes = Number(section.scheduled_minutes || Math.max(
        10,
        Math.round(Number(section.distance_km || 0) / Math.max(Number(section.sched_speed_kmh || 1), 1) * 60)
      ));
      accumulatedMinutes += sectionMinutes;

      // The current predictive service gives the next-station delay. For
      // downstream stations we carry that uncertainty forward conservatively.
      const delay = Math.max(0, Number(pos.delay_minutes || 0));
      const code = train.route[i + 1];

      const isNextStation = i === startIdx;
      const rowP5 = isNextStation && mlPrediction
        ? Number(mlPrediction.p5_minutes || 0)
        : Math.max(0, Number(delay) - 5);
      const rowP50 = isNextStation && mlPrediction
        ? Number(mlPrediction.p50_minutes || 0)
        : Math.max(0, Number(delay));
      const rowP95 = isNextStation && mlPrediction
        ? Number(mlPrediction.p95_minutes || 0)
        : Number(delay) + 8;
      const eta = new Date(Date.now() + (accumulatedMinutes + rowP50) * 60000);

      rows.push({
        stationCode: code,
        stationName: stationMap[code]?.name || code,
        scheduledMinutesFromCurrent: accumulatedMinutes,
        predictedDelayMinutes: Math.round(rowP50 * 10) / 10,
        delayRangeMinutes: [Math.round(rowP5 * 10) / 10, Math.round(rowP95 * 10) / 10],
        predictedETA: eta.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) + " IST",
        etaIso: eta.toISOString(),
      });
    }

    res.json({
      trainNumber: train.train_number,
      trainName: train.train_name,
      currentStation: stationMap[train.route[startIdx]]?.name || train.route[startIdx],
      updatedAt: pos.updated_at,
      prediction: mlPrediction ? {
        p5_minutes: mlPrediction.p5_minutes,
        p50_minutes: mlPrediction.p50_minutes,
        p95_minutes: mlPrediction.p95_minutes,
        delay_probability_percent: mlPrediction.delay_probability_percent,
        top_reason: mlPrediction.top_reason,
      } : null,
      forecast: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unable to build station forecast." });
  }
});

router.get("/:trainNumber/live", async (req, res) => {
  const train = await Train.findOne({ train_number: req.params.trainNumber });
  const pos = await LivePosition.findOne({ train_number: req.params.trainNumber });
  if (!train || !pos) return res.status(404).json({ error: "Train not found" });
  const stations = await Station.find({ code: { $in: train.route } });
  const stationMap = Object.fromEntries(stations.map((s) => [s.code, s]));
  res.json(toTrainDto(train, pos, await predictForTrain(train.train_number), stationMap));
});

router.get("/:trainNumber/predict", async (req, res) => {
  try {
    const prediction = await predictForTrain(req.params.trainNumber);
    if (!prediction) return res.status(404).json({ error: "Train not found" });
    res.json(prediction);
  } catch (err) {
    console.error(`[GET /api/trains/${req.params.trainNumber}/predict] failed:`, err);
    res.status(500).json({ message: "Unable to generate delay prediction." });
  }
});

export default router;
