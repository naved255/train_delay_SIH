import express from "express";
import Station from "../models/Station.js";
import Train from "../models/Train.js";
import LivePosition from "../models/LivePosition.js";
import StationOperation from "../models/StationOperation.js";
import { predictForTrains } from "../services/predictionService.js";
import { authenticateToken, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticateToken, async (_req, res, next) => {
  try {
    const stations = await Station.find({}).lean();
    res.json(stations);
  } catch (err) {
    next(err);
  }
});

router.get(
  "/:code/arrivals",
  authenticateToken,
  authorizeRoles("STATION_STAFF", "CONTROL_ROOM"),
  async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const code = String(req.params.code || "").toUpperCase();
      const station = await Station.findOne({ code }).lean();
      if (!station) return res.status(404).json({ message: "Station not found." });

      // One train query + one position query instead of one position query per train.
      const trains = await Train.find({ route: code })
        .select("train_number train_name route")
        .lean();

      const numbers = trains.map((t) => String(t.train_number));
      const [positions, op] = await Promise.all([
        LivePosition.find({ train_number: { $in: numbers } })
          .select("train_number route_idx")
          .lean(),
        StationOperation.findOne({ station_code: code }).lean(),
      ]);

      const positionMap = new Map(
        positions.map((p) => [String(p.train_number), p])
      );

      const candidates = trains.filter((train) => {
        const idx = train.route.indexOf(code);
        const pos = positionMap.get(String(train.train_number));
        return pos && idx >= Number(pos.route_idx || 0) && idx - Number(pos.route_idx || 0) <= 2;
      });

      const predictions = await predictForTrains(
        candidates.map((t) => t.train_number),
        6
      );

      const results = candidates.map((train) => {
        const prediction = predictions.get(String(train.train_number));
        const assigned = op?.platform_assignments?.[String(train.train_number)] || null;

        return {
          id: String(train.train_number),
          trainNumber: String(train.train_number),
          trainName: train.train_name,
          scheduledTime: "Dynamic schedule",
          predictedDelay: Math.round(prediction?.p50_minutes || 0),
          predictedRange: prediction
            ? [Math.round(prediction.p5_minutes), Math.round(prediction.p95_minutes)]
            : null,
          platformAssigned: assigned || "Unassigned",
          status: (prediction?.p50_minutes || 0) > 20 ? "Delayed" : "Expected",
          mlConfidence: prediction?.model_source === "statistical-fallback" ? 65 : 90,
          reason: prediction?.top_reason,
        };
      });

      console.log(
        `[GET /api/stations/${code}/arrivals] ${results.length} trains in ${Date.now() - startedAt}ms`
      );

      res.json({
        station: {
          code: station.code,
          name: station.name,
          junctionComplexity: station.junction_complexity,
        },
        arrivals: results,
        platformAssignments: op?.platform_assignments || {},
        recentAnnouncements: (op?.announcements || []).slice(-10).reverse(),
      });
    } catch (err) {
      console.error(`[GET /api/stations/${req.params.code}/arrivals] failed:`, err);
      next(err);
    }
  }
);

export default router;
