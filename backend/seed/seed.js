import "dotenv/config";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import Station from "../models/Station.js";
import Train from "../models/Train.js";
import LivePosition from "../models/LivePosition.js";
import FeederConnection from "../models/FeederConnection.js";
import DelayLog from "../models/DelayLog.js";
import StationOperation from "../models/StationOperation.js";

// Realistic-ish Indian station set with real coordinates, for map plotting.
const STATIONS = [
  { code: "NDLS", name: "New Delhi", lat: 28.6435, lon: 77.2197, junction_complexity: 3 },
  { code: "GZB",  name: "Ghaziabad", lat: 28.6692, lon: 77.4538, junction_complexity: 2 },
  { code: "CNB",  name: "Kanpur Central", lat: 26.4499, lon: 80.3319, junction_complexity: 3 },
  { code: "ALD",  name: "Prayagraj Jn", lat: 25.4358, lon: 81.8463, junction_complexity: 3 },
  { code: "MGS",  name: "Mughalsarai (DDU)", lat: 25.2823, lon: 83.1250, junction_complexity: 3 },
  { code: "PNBE", name: "Patna Jn", lat: 25.6093, lon: 85.1376, junction_complexity: 3 },
  { code: "HWH",  name: "Howrah Jn", lat: 22.5839, lon: 88.3428, junction_complexity: 3 },
  { code: "BSL",  name: "Bhusaval Jn", lat: 21.0473, lon: 75.7887, junction_complexity: 3 },
  { code: "JL",   name: "Jalgaon Jn", lat: 21.0181, lon: 75.5629, junction_complexity: 2 },
  { code: "MMR",  name: "Manmad Jn", lat: 20.2499, lon: 74.4383, junction_complexity: 3 },
  { code: "NK",   name: "Nasik Road", lat: 19.9476, lon: 73.8419, junction_complexity: 1 },
  { code: "PUNE", name: "Pune Jn", lat: 18.5286, lon: 73.8741, junction_complexity: 3 },
  { code: "SUR",  name: "Solapur Jn", lat: 17.6645, lon: 75.8934, junction_complexity: 3 },
  { code: "MA",   name: "Madha", lat: 18.0297, lon: 75.5465, junction_complexity: 1 },
  { code: "KWV",  name: "Kurduvadi", lat: 18.0913, lon: 75.4171, junction_complexity: 1 },
  { code: "SBC",  name: "Bengaluru City", lat: 12.9767, lon: 77.5713, junction_complexity: 3 },
  { code: "MAS",  name: "Chennai Central", lat: 13.0827, lon: 80.2707, junction_complexity: 3 },
  { code: "BD",   name: "Badnera Jn", lat: 20.8568, lon: 77.7323, junction_complexity: 3 },
  { code: "AK",   name: "Akola Jn", lat: 20.7231, lon: 77.0055, junction_complexity: 3 },
  { code: "SEG",  name: "Shegaon", lat: 20.8017, lon: 76.6903, junction_complexity: 1 },
];

const TRAIN_TEMPLATES = [
  { number: "12951", name: "Mumbai Rajdhani", category: "Superfast", route: ["NDLS", "GZB", "CNB", "ALD", "MGS"] },
  { number: "12301", name: "Howrah Rajdhani", category: "Superfast", route: ["HWH", "MGS", "ALD", "CNB", "GZB", "NDLS"] },
  { number: "12621", name: "Tamil Nadu Express", category: "Superfast", route: ["NDLS", "CNB", "ALD", "MGS", "MAS"] },
  { number: "01211", name: "BD NK SPL", category: "Passenger", route: ["BD", "AK", "SEG", "JL", "BSL", "MMR", "NK"] },
  { number: "01212", name: "NK BD SPL", category: "Passenger", route: ["NK", "MMR", "BSL", "JL", "SEG", "AK", "BD"] },
  { number: "01461", name: "SUR DD DMU SPL", category: "Passenger", route: ["SUR", "MA", "KWV", "PUNE"] },
  { number: "22691", name: "Yesvantpur Rajdhani", category: "Superfast", route: ["SBC", "PUNE", "BSL", "CNB", "NDLS"] },
  { number: "17318", name: "Solapur Express", category: "Express", route: ["SUR", "KWV", "MA", "PUNE", "MMR", "NK"] },
  { number: "12137", name: "Punjab Mail", category: "Express", route: ["PUNE", "BSL", "JL", "MMR", "NK", "MGS"] },
  { number: "18029", name: "LTT Howrah Express", category: "Express", route: ["PUNE", "BSL", "MGS", "HWH"] },
];

function randSection(rng) {
  return {
    distance_km: Math.round(15 + rng() * 75),
    sched_speed_kmh: Math.round(35 + rng() * 75),
    level_crossings: Math.floor(rng() * 4),
    is_ghat: rng() < 0.1 ? 1 : 0,
    track_type: "Double-Electrified",
  };
}

// simple deterministic PRNG so seed data is reproducible across runs
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seed() {
  await connectDB();
  const rng = mulberry32(42);

  console.log("Clearing existing data...");
  await Promise.all([
    Station.deleteMany({}), Train.deleteMany({}), LivePosition.deleteMany({}),
    FeederConnection.deleteMany({}), DelayLog.deleteMany({}), StationOperation.deleteMany({}),
  ]);

  console.log("Seeding stations...");
  await Station.insertMany(STATIONS);

  console.log("Seeding trains...");
  const priorityMap = { Superfast: 1, Express: 2, Passenger: 4 };
  const trainDocs = TRAIN_TEMPLATES.map((t) => ({
    train_number: t.number,
    train_name: t.name,
    category: t.category,
    train_priority: priorityMap[t.category],
    route: t.route,
    sections: t.route.slice(0, -1).map((from, i) => ({
      from_station: from,
      to_station: t.route[i + 1],
      ...randSection(rng),
      scheduled_minutes: 15,
    })),
  }));
  await Train.insertMany(trainDocs);

  console.log("Seeding live positions (each train starts partway through its route)...");
  const livePositions = trainDocs.map((t) => ({
    train_number: t.train_number,
    route_idx: Math.floor(rng() * Math.max(t.route.length - 2, 1)),
    delay_minutes: Math.round(rng() * 20),
    delay_history: [],
  }));
  await LivePosition.insertMany(livePositions);

  console.log("Seeding feeder connections...");
  const feeders = [
    { station_code: "SUR", train_number: "01461", connecting_service: "Solapur City Bus #14", connection_departure_time: "14:45", min_buffer_minutes: 5 },
    { station_code: "SUR", train_number: "17318", connecting_service: "Shared Taxi to Akkalkot", connection_departure_time: "16:10", min_buffer_minutes: 10 },
    { station_code: "PNBE", train_number: "12301", connecting_service: "Local Train to Danapur", connection_departure_time: "09:15", min_buffer_minutes: 8 },
    { station_code: "PUNE", train_number: "22691", connecting_service: "PMPML Bus #100", connection_departure_time: "18:20", min_buffer_minutes: 6 },
    { station_code: "NK", train_number: "01212", connecting_service: "Nashik Local Bus #7", connection_departure_time: "11:30", min_buffer_minutes: 5 },
    { station_code: "MGS", train_number: "18029", connecting_service: "Varanasi Connector Bus", connection_departure_time: "20:05", min_buffer_minutes: 7 },
  ];
  await FeederConnection.insertMany(feeders);

  await StationOperation.insertMany([{
    station_code: "NDLS",
    platform_assignments: new Map([
      ["12951", "Platform 1"], ["12301", "Platform 3"], ["12621", "Platform 7"]
    ]),
    announcements: []
  }]);

  console.log("Seed complete.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
