import mongoose from "mongoose";

const StationOperationSchema = new mongoose.Schema({
  station_code: { type: String, unique: true, required: true },
  platform_assignments: { type: Map, of: String, default: {} },
  announcements: [{
    message: String,
    created_at: { type: Date, default: Date.now },
    created_by: String,
  }],
});

export default mongoose.model("StationOperation", StationOperationSchema);
