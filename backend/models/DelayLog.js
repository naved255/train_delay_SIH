import mongoose from "mongoose";

const DelayLogSchema = new mongoose.Schema({
  train_number: String,
  station_code: String,
  delay_minutes: Number,
  logged_at: { type: Date, default: Date.now },
  source: { type: String, default: "SIMULATOR" },
  reason: String,
});

export default mongoose.model("DelayLog", DelayLogSchema);

// Query patterns used by prediction/cascade dashboards.
DelayLogSchema.index({ station_code: 1, logged_at: -1 });
DelayLogSchema.index({ train_number: 1, logged_at: -1 });
