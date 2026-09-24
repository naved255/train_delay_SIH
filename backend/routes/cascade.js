import express from "express";
import Train from "../models/Train.js";
import LivePosition from "../models/LivePosition.js";
import { predictForTrain } from "../services/predictionService.js";
import { authenticateToken, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticateToken, authorizeRoles("CONTROL_ROOM"));

router.get("/:trainNumber", async (req, res, next) => {
  const startedAt = Date.now();
  try {
    const trainNumber = String(req.params.trainNumber);
    const train = await Train.findOne({ train_number: trainNumber })
      .select("train_number train_name route")
      .lean();

    const pos = await LivePosition.findOne({ train_number: trainNumber }).lean();
    if (!train || !pos) return res.status(404).json({ error: "Train not found" });

    const idx = Math.min(
      Math.max(Number(pos.route_idx || 0), 0),
      Math.max(train.route.length - 2, 0)
    );
    const sectionStations = [train.route[idx], train.route[idx + 1]].filter(Boolean);
    const section = sectionStations.slice().sort().join("-");

    const prediction = await predictForTrain(trainNumber);

    // Find only trains that can possibly share either endpoint of this section.
    // This avoids loading/querying every train + every LivePosition individually.
    const candidates = await Train.find({
      train_number: { $ne: trainNumber },
      route: { $in: sectionStations },
    })
      .select("train_number train_name route")
      .lean();

    const candidateNumbers = candidates.map((t) => String(t.train_number));
    const positions = await LivePosition.find({
      train_number: { $in: candidateNumbers },
    })
      .select("train_number route_idx delay_minutes")
      .lean();

    const positionMap = new Map(
      positions.map((p) => [String(p.train_number), p])
    );

    const atRisk = [];
    for (const other of candidates) {
      const otherPos = positionMap.get(String(other.train_number));
      if (!otherPos || other.route.length < 2) continue;

      const oi = Math.min(
        Math.max(Number(otherPos.route_idx || 0), 0),
        Math.max(other.route.length - 2, 0)
      );
      const otherSection = [other.route[oi], other.route[oi + 1]]
        .filter(Boolean)
        .sort()
        .join("-");

      if (otherSection === section) {
        atRisk.push({
          trainNumber: other.train_number,
          trainName: other.train_name,
          sharedSection: section,
          currentDelay: Math.round(Number(otherPos.delay_minutes || 0)),
          propagatedDelayEstimate: Math.round((prediction?.p50_minutes || 0) * 0.4),
        });
      }
    }

    console.log(
      `[GET /api/cascade/${trainNumber}] ${atRisk.length} at-risk trains in ${Date.now() - startedAt}ms`
    );

    res.json({
      trainNumber: train.train_number,
      section,
      predictedDelayP50: prediction?.p50_minutes ?? null,
      topReason: prediction?.top_reason,
      atRiskTrains: atRisk,
    });
  } catch (err) {
    console.error(`[GET /api/cascade/${req.params.trainNumber}] failed:`, err);
    next(err);
  }
});

export default router;
