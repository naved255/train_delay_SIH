import mongoose from "mongoose";

const FeederConnectionSchema = new mongoose.Schema({
  station_code: String,
  train_number: String,
  connecting_service: String,
  connection_departure_time: String,
  adjusted_departure_time: String,
  min_buffer_minutes: { type: Number, default: 5 },
});

export default mongoose.model("FeederConnection", FeederConnectionSchema);
