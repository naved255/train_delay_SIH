import mongoose from "mongoose";

export const USER_ROLES = [
  "PASSENGER",
  "STATION_STAFF",
  "CONTROL_ROOM",
  "FEEDER_MANAGER",
];

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "PASSENGER" },
    roleDetail: { type: String, default: "Passenger Portal", trim: true, maxlength: 120 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
