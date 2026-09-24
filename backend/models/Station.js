import mongoose from "mongoose";

const StationSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: String,
  lat: Number,
  lon: Number,
  junction_complexity: { type: Number, default: 1 },
});

export default mongoose.model("Station", StationSchema);
