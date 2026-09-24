import Train from "../models/Train.js";
import LivePosition from "../models/LivePosition.js";
import DelayLog from "../models/DelayLog.js";

function simulateDelay(section, routeIdx, routeLen, category) {
  let base = 2;
  if (section?.is_ghat) base += 12;
  base += (section?.level_crossings || 0) * 2;
  base += (routeIdx / Math.max(routeLen - 1, 1)) * 8;
  if (category === "Passenger") base += 6;
  else if (category === "Express") base += 2;
  if ([7,8,9,18,19,20].includes(new Date().getHours())) base += 4;
  const noise = (Math.random() - 0.5) * 10;
  let delay = Math.max(0, base + noise);
  if (Math.random() < 0.05) delay += 15 + Math.random() * 35;
  return Math.round(delay * 10) / 10;
}

let running = false;
let batchOffset = 0;
export async function tickSimulator() {
  if (running) return;
  running = true;
  try {
    const batchSize = Math.min(Number(process.env.SIMULATOR_BATCH_SIZE) || 100, 500);
    const total = await Train.countDocuments({});
    if (!total) return;
    const offset = batchOffset % total;
    let trains = await Train.find({}).sort({ train_number: 1 }).skip(offset).limit(batchSize).lean();
    batchOffset = (offset + batchSize) % total;
    for (const train of trains) {
      const pos = await LivePosition.findOne({ train_number: train.train_number });
      if (!pos || train.route.length < 2) continue;
      let idx = Math.min(Math.max(pos.route_idx, 0), train.route.length - 2);
      const section = train.sections[idx];
      const delay = simulateDelay(section, idx, train.route.length, train.category);
      pos.route_idx = idx + 1 >= train.route.length - 1 ? 0 : idx + 1;
      pos.delay_minutes = delay;
      pos.updated_at = new Date();
      pos.delay_history = [...(pos.delay_history || []), delay].slice(-10);
      await pos.save();
      // Logging every train every few seconds creates an unbounded collection.
      // Keep telemetry history bounded by sampling simulator events.
      if (Math.random() < Number(process.env.SIMULATOR_LOG_SAMPLE_RATE || 0.25)) {
        await DelayLog.create({
          train_number: train.train_number,
          station_code: train.route[idx],
          delay_minutes: delay,
          logged_at: new Date(),
          source: "SIMULATOR",
          reason: "Synthetic live telemetry",
        });
      }
    }
  } finally {
    running = false;
  }
}

export function startSimulator(intervalMs = 8000) {
  console.log(`Live position simulator started every ${intervalMs / 1000}s`);
  tickSimulator().catch(console.error);
  setInterval(() => tickSimulator().catch(console.error), intervalMs);
}
