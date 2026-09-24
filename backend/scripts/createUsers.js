import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";

const USERS = [
  { email: "passenger@railway.in", password: "password123", name: "Rohan Sharma", role: "PASSENGER", roleDetail: "Passenger Portal" },
  { email: "station@railway.in", password: "password123", name: "Station Master (NDLS)", role: "STATION_STAFF", roleDetail: "NDLS" },
  { email: "control@railway.in", password: "password123", name: "Chief Controller", role: "CONTROL_ROOM", roleDetail: "NR-DELHI-DIV-01" },
  { email: "feeder@railway.in", password: "password123", name: "DMRC Feeder Dispatcher", role: "FEEDER_MANAGER", roleDetail: "DMRC-YELLOW-LINE-04" },
];

async function main() {
  await connectDB();
  for (const item of USERS) {
    const passwordHash = await bcrypt.hash(item.password, 12);
    await User.updateOne(
      { email: item.email },
      { $set: { ...item, email: item.email.toLowerCase(), passwordHash } },
      { upsert: true }
    );
    console.log(`Provisioned ${item.role}: ${item.email}`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
