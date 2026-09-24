import mongoose from "mongoose";

const SectionSchema = new mongoose.Schema({
  from_station: String,
  to_station: String,
  distance_km: Number,
  sched_speed_kmh: Number,
  scheduled_minutes: Number,
  level_crossings: Number,
  is_ghat: Number,
  track_type: String,
}, { _id: false });

const TrainSchema = new mongoose.Schema({
  train_number: { type: String, required: true, unique: true },
  train_name: String,
  category: { type: String, enum: ["Passenger", "Express", "Superfast"], default: "Express" },
  train_priority: { type: Number, default: 2 },
  route: [String],
  sections: [SectionSchema],
});

export default mongoose.model("Train", TrainSchema);
