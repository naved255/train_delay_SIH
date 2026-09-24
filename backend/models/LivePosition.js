import mongoose from "mongoose";

const LivePositionSchema = new mongoose.Schema({
  train_number: { type: String, required: true, unique: true },
  route_idx: { type: Number, default: 0 },     // index into train.route -- current "last_station"
  delay_minutes: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },
  delay_history: [{ type: Number }],           // recent delays, for trend calc
});

export default mongoose.model("LivePosition", LivePositionSchema);
