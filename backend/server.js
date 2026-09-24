import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import trainRoutes from "./routes/trains.js";
import stationRoutes from "./routes/stations.js";
import cascadeRoutes from "./routes/cascade.js";
import feederRoutes from "./routes/feeder.js";
import { authenticateToken, authorizeRoles } from "./middleware/auth.js";
import { startSimulator } from "./simulator/liveSimulator.js";
import { invalidatePrediction } from "./services/predictionService.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());

if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
    next();
  });
}

app.get("/api/health", async (_req, res) => {
  res.json({ status: "ok", service: "railway-eta-backend", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/trains", trainRoutes);
app.use("/api/stations", stationRoutes);
app.use("/api/cascade", cascadeRoutes);
app.use("/api/feeder", feederRoutes);

app.post("/api/control/inject-delay",
  authenticateToken,
  authorizeRoles("CONTROL_ROOM"),
  async (req, res) => {
    const { trainNumber, delayMinutes, reason } = req.body;
    if (!trainNumber || !Number.isFinite(Number(delayMinutes)) || Number(delayMinutes) < 1) {
      return res.status(400).json({ message: "trainNumber and a positive delayMinutes are required." });
    }
    try {
      const { default: LivePosition } = await import("./models/LivePosition.js");
      const { default: DelayLog } = await import("./models/DelayLog.js");
      const pos = await LivePosition.findOne({ train_number: String(trainNumber) });
      if (!pos) return res.status(404).json({ message: "Train live position not found." });
      pos.delay_minutes = Number(delayMinutes);
      pos.delay_history = [...(pos.delay_history || []), Number(delayMinutes)].slice(-10);
      pos.updated_at = new Date();
      await pos.save();
      invalidatePrediction(trainNumber);
      await DelayLog.create({
        train_number: String(trainNumber),
        station_code: req.body.stationCode || "CONTROL",
        delay_minutes: Number(delayMinutes),
        logged_at: new Date(),
        source: "CONTROL_ROOM",
        reason: reason || "Operational incident",
      });
      res.json({ message: "Delay injected and live ETA inputs updated.", trainNumber: String(trainNumber), delayMinutes: Number(delayMinutes), reason });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Unable to inject delay." });
    }
  }
);

app.post("/api/station/assign-platform",
  authenticateToken,
  authorizeRoles("STATION_STAFF", "CONTROL_ROOM"),
  async (req, res) => {
    const { stationCode, trainNumber, platform } = req.body;
    if (!stationCode || !trainNumber || !platform) {
      return res.status(400).json({ message: "stationCode, trainNumber and platform are required." });
    }
    try {
      const { default: StationOperation } = await import("./models/StationOperation.js");
      const op = await StationOperation.findOneAndUpdate(
        { station_code: stationCode.toUpperCase() },
        { $set: { [`platform_assignments.${trainNumber}`]: platform } },
        { upsert: true, new: true }
      );
      res.json({ message: "Platform assignment updated.", stationCode: stationCode.toUpperCase(), trainNumber: String(trainNumber), platform, operation: op });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Unable to update platform assignment." });
    }
  }
);

app.post("/api/station/announcement",
  authenticateToken,
  authorizeRoles("STATION_STAFF", "CONTROL_ROOM"),
  async (req, res) => {
    const { stationCode, message } = req.body;
    if (!stationCode || !message?.trim()) return res.status(400).json({ message: "stationCode and message are required." });
    try {
      const { default: StationOperation } = await import("./models/StationOperation.js");
      const op = await StationOperation.findOneAndUpdate(
        { station_code: stationCode.toUpperCase() },
        { $push: { announcements: { message: message.trim(), created_at: new Date(), created_by: req.user.email } } },
        { upsert: true, new: true }
      );
      res.json({ message: "Announcement dispatched to the station operations backend.", announcement: op.announcements.at(-1) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Unable to dispatch announcement." });
    }
  }
);

app.use((err, req, res, _next) => {
  console.error(`[HTTP ERROR] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return;
  res.status(500).json({ message: "Internal server error.", detail: process.env.NODE_ENV === "production" ? undefined : err.message });
});

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`Railway ETA backend running on http://localhost:${PORT}`));
    if (process.env.ENABLE_SIMULATOR !== "false") startSimulator(Number(process.env.SIMULATOR_INTERVAL_MS || 8000));
  } catch (err) {
    console.error("Backend startup failed:", err);
    process.exit(1);
  }
}

start();
export default app;
