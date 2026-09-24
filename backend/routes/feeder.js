import express from "express";
import FeederConnection from "../models/FeederConnection.js";
import { predictForTrains } from "../services/predictionService.js";
import { authenticateToken, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

function addMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date();
  d.setHours(h, m + Math.max(0, Math.round(minutes)), 0, 0);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildResult(conn, prediction) {
  if (!prediction) return null;

  const adjusted = addMinutes(
    conn.connection_departure_time,
    prediction.p50_minutes
  );

  return {
    id: `${conn.station_code}-${conn.train_number}`,
    stationCode: conn.station_code,
    trainNumber: conn.train_number,
    trainName: prediction.train_name,
    connectingService: conn.connecting_service,
    scheduledDeparture: conn.connection_departure_time,
    adjustedDeparture: conn.adjusted_departure_time || adjusted,
    predictedDelay: Math.round(prediction.p50_minutes),
    minBufferMinutes: conn.min_buffer_minutes,
    syncStatus:
      prediction.p50_minutes > conn.min_buffer_minutes
        ? "RESCHEDULED"
        : "ON_SCHEDULE",
    modelSource: prediction.model_source || "ML service",
  };
}

router.get(
  "/",
  authenticateToken,
  authorizeRoles("FEEDER_MANAGER", "CONTROL_ROOM"),
  async (_req, res, next) => {
    try {
      const connections = await FeederConnection.find({}).lean();
      const predictions = await predictForTrains(
        connections.map((c) => c.train_number),
        6
      );

      const results = connections
        .map((conn) =>
          buildResult(conn, predictions.get(String(conn.train_number)))
        )
        .filter(Boolean);

      res.json(results);
    } catch (err) {
      console.error("[GET /api/feeder] failed:", err);
      next(err);
    }
  }
);

router.post(
  "/:trainNumber/sync",
  authenticateToken,
  authorizeRoles("FEEDER_MANAGER", "CONTROL_ROOM"),
  async (req, res, next) => {
    try {
      const conn = await FeederConnection.findOne({
        train_number: req.params.trainNumber,
      });

      if (!conn) {
        return res
          .status(404)
          .json({ message: "Feeder connection not found." });
      }

      const predictions = await predictForTrains([conn.train_number], 1);
      const prediction = predictions.get(String(conn.train_number));

      if (!prediction) {
        return res
          .status(404)
          .json({ message: "Connected train not found." });
      }

      conn.adjusted_departure_time = addMinutes(
        conn.connection_departure_time,
        prediction.p50_minutes
      );
      await conn.save();

      res.json({
        message: "Feeder dispatch synchronized with the latest ETA.",
        ...buildResult(conn.toObject(), prediction),
      });
    } catch (err) {
      console.error(`[POST /api/feeder/${req.params.trainNumber}/sync] failed:`, err);
      next(err);
    }
  }
);

export default router;
