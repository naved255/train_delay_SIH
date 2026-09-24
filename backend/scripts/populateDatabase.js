import "dotenv/config";

import fs from "fs";
import path from "path";
import csv from "csv-parser";
import mongoose from "mongoose";

import { connectDB } from "../config/db.js";

import Train from "../models/Train.js";
import Station from "../models/Station.js";
import LivePosition from "../models/LivePosition.js";
import DelayLog from "../models/DelayLog.js";
import FeederConnection from "../models/FeederConnection.js";
import StationOperation from "../models/StationOperation.js";


// ============================================================
// CONFIG
// ============================================================

const DATA_DIR = path.resolve("data");

const EXPRESS_FILE = path.join(
  DATA_DIR,
  "EXP-TRAINS.json"
);

const PASSENGER_FILE = path.join(
  DATA_DIR,
  "PASS-TRAINS.json"
);

const SUPERFAST_FILE = path.join(
  DATA_DIR,
  "SF-TRAINS.json"
);

const OBSERVATION_FILE = path.join(
  DATA_DIR,
  "raw_train_observations2.csv"
);

const TRAIN_DATA_FILE = path.join(
  DATA_DIR,
  "train_data.csv"
);


// 70% of generated operational records will be delayed.
const DELAY_RATE = 0.70;


// ============================================================
// UTILITIES
// ============================================================

function exists(file) {
  return fs.existsSync(file);
}


function readJSON(file) {

  if (!exists(file)) {
    console.warn(`File not found: ${file}`);
    return [];
  }

  try {

    const data = JSON.parse(
      fs.readFileSync(file, "utf8")
    );

    if (Array.isArray(data)) {
      return data;
    }

    // Some files may contain:
    // { trains: [...] }

    if (Array.isArray(data.trains)) {
      return data.trains;
    }

    return [];

  } catch (error) {

    console.error(
      `Unable to read ${file}`,
      error.message
    );

    return [];
  }
}


function number(value, fallback = 0) {

  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "########"
  ) {
    return fallback;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


function clean(value) {

  if (
    value === undefined ||
    value === null ||
    value === "########"
  ) {
    return "";
  }

  return String(value).trim();
}


function randomInt(min, max) {

  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}


function shuffle(array) {

  const copy = [...array];

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {

    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [copy[i], copy[j]] =
      [copy[j], copy[i]];
  }

  return copy;
}


function delayedRecord() {

  return Math.random() < DELAY_RATE;
}


function generateDelay(row = {}) {

  /*
   * Generate a realistic-ish delay based on
   * operational/environmental characteristics.
   */

  let delay = randomInt(3, 10);

  const crossings =
    number(row.level_crossings);

  const rain =
    number(row.precipitation_sum);

  const fog =
    number(row.is_fog_day);

  const ghat =
    number(row.is_ghat);

  const junction =
    number(row.junction_complexity);

  const historical =
    number(row.hist_avg_station_delay) ||
    number(row.hist_avg_train_station_delay);


  delay += Math.round(
    crossings * 0.25
  );

  delay += Math.round(
    rain * 0.4
  );

  delay += Math.round(
    historical * 0.5
  );

  delay += Math.round(
    junction * 0.5
  );

  if (fog === 1) {
    delay += randomInt(2, 6);
  }

  if (ghat === 1) {
    delay += randomInt(2, 7);
  }

  delay += randomInt(0, 6);

  return Math.max(
    1,
    Math.round(delay)
  );
}


// ============================================================
// PARSE STATION CODE
// ============================================================

function parseStation(value) {

  const text = clean(value);

  if (!text) {
    return {
      name: "",
      code: ""
    };
  }

  /*
   * Example:
   *
   * MARWAR JN - MJ
   *
   * becomes:
   *
   * name = MARWAR JN
   * code = MJ
   */

  const parts = text.split(/\s+-\s+/);

  if (parts.length >= 2) {

    return {
      name: parts[0].trim(),
      code: parts[parts.length - 1]
        .trim()
        .toUpperCase()
    };
  }


  /*
   * Fallback if the format is:
   *
   * MARWAR JN MJ
   */

  const tokens = text.split(/\s+/);

  const last = tokens[tokens.length - 1];

  if (
    last.length >= 2 &&
    last.length <= 5 &&
    /^[A-Z0-9]+$/i.test(last)
  ) {

    return {
      name: tokens
        .slice(0, -1)
        .join(" ")
        .trim(),

      code: last.toUpperCase()
    };
  }


  return {
    name: text,
    code: text
      .replace(/[^A-Za-z0-9]/g, "")
      .substring(0, 5)
      .toUpperCase()
  };
}


// ============================================================
// PARSE SCHEDULE TIME
// ============================================================

function timeToMinutes(time) {

  if (!time) {
    return null;
  }

  const value = clean(time);

  if (
    value === "Source" ||
    value === "Destination" ||
    value === "00:00"
  ) {
    return null;
  }

  const parts = value.split(":");

  if (parts.length !== 2) {
    return null;
  }

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  return hour * 60 + minute;
}


function calculateScheduledMinutes(
  fromStation,
  toStation
) {

  const departure =
    timeToMinutes(
      fromStation?.departs
    );

  const arrival =
    timeToMinutes(
      toStation?.arrives
    );

  if (
    departure === null ||
    arrival === null
  ) {

    return 30;
  }

  let diff =
    arrival - departure;

  /*
   * Handle overnight journey.
   */

  if (diff <= 0) {
    diff += 24 * 60;
  }

  return Math.max(
    5,
    diff
  );
}


// ============================================================
// READ RAW CSV
// ============================================================

function readCSV(file) {

  return new Promise(
    (resolve, reject) => {

      if (!exists(file)) {
        console.warn(
          `CSV not found: ${file}`
        );

        resolve([]);

        return;
      }

      const rows = [];

      fs.createReadStream(file)
        .pipe(
          csv({
            mapHeaders: ({
              header
            }) => header.trim()
          })
        )
        .on("data", row => {
          rows.push(row);
        })
        .on("end", () => {
          resolve(rows);
        })
        .on("error", reject);
    }
  );
}


// ============================================================
// LOAD ALL TRAIN JSON
// ============================================================

function loadTrainFiles() {

  const result = [];

  const files = [

    {
      file: EXPRESS_FILE,
      category: "Express"
    },

    {
      file: PASSENGER_FILE,
      category: "Passenger"
    },

    {
      file: SUPERFAST_FILE,
      category: "Superfast"
    }

  ];


  for (const item of files) {

    const trains =
      readJSON(item.file);

    console.log(
      `${item.category}: ${trains.length} trains`
    );


    for (const train of trains) {

      result.push({
        ...train,
        __category: item.category
      });
    }
  }


  return result;
}


// ============================================================
// CREATE STATION COORDINATE MAP
// ============================================================

function buildCoordinateMap(
  observationRows,
  trainingRows
) {

  const map = new Map();


  /*
   * First use training dataset coordinates.
   */

  for (
    const row of trainingRows
  ) {

    const station =
      clean(row.station_name);

    if (!station) continue;

    const lat =
      number(row.latitude, null);

    const lon =
      number(row.longitude, null);

    if (
      lat === null ||
      lon === null
    ) {
      continue;
    }

    map.set(
      station.toUpperCase(),
      {
        lat,
        lon
      }
    );
  }


  /*
   * Then add observation coordinates.
   */

  for (
    const row of observationRows
  ) {

    const station =
      clean(row.station_name);

    const lat =
      number(row.latitude, null);

    const lon =
      number(row.longitude, null);

    if (
      !station ||
      lat === null ||
      lon === null
    ) {
      continue;
    }

    map.set(
      station.toUpperCase(),
      {
        lat,
        lon
      }
    );
  }


  return map;
}


// ============================================================
// CREATE TRAINS
// ============================================================

function buildTrains(
  trainFiles
) {

  const map = new Map();


  for (
    const rawTrain of trainFiles
  ) {

    const numberValue =
      clean(
        rawTrain.trainNumber ||
        rawTrain.number ||
        rawTrain.train_number
      );

    if (!numberValue) {
      continue;
    }


    const routeData =
      Array.isArray(
        rawTrain.trainRoute
      )
        ? rawTrain.trainRoute
        : [];


    const route = [];

    const routeStations = [];


    for (
      const station of routeData
    ) {

      const parsed =
        parseStation(
          station.stationName ||
          station.name ||
          station.station ||
          station
        );


      if (!parsed.code) {
        continue;
      }


      route.push(
        parsed.code
      );


      routeStations.push({
        ...station,
        ...parsed
      });
    }


    /*
     * Avoid duplicate trains if the same
     * train appears in more than one source.
     */

    if (map.has(numberValue)) {
      continue;
    }


    const category =
      rawTrain.__category ||
      "Express";


    const priority =
      category === "Superfast"
        ? 1
        : category === "Express"
          ? 2
          : 4;


    const sections = [];


    for (
      let i = 0;
      i < routeStations.length - 1;
      i++
    ) {

      const from =
        routeStations[i];

      const to =
        routeStations[i + 1];


      const fromDistance =
        number(
          String(
            from.distance ||
            "0"
          ).replace(
            /[^0-9.]/g,
            ""
          )
        );


      const toDistance =
        number(
          String(
            to.distance ||
            "0"
          ).replace(
            /[^0-9.]/g,
            ""
          )
        );


      let distance =
        Math.abs(
          toDistance -
          fromDistance
        );


      /*
       * If distance isn't available,
       * use a reasonable fallback.
       */

      if (
        distance === 0 ||
        !Number.isFinite(distance)
      ) {

        distance =
          randomInt(10, 80);
      }


      const scheduledMinutes =
        calculateScheduledMinutes(
          from,
          to
        );


      const speed =
        Math.max(
          25,
          Math.min(
            120,
            Math.round(
              distance /
              (scheduledMinutes / 60)
            )
          )
        );


      sections.push({

        from_station:
          from.code,

        to_station:
          to.code,

        distance_km:
          Math.round(
            distance * 10
          ) / 10,

        sched_speed_kmh:
          speed,

        scheduled_minutes:
          scheduledMinutes,

        level_crossings:
          randomInt(0, 8),

        is_ghat:
          Math.random() < 0.08
            ? 1
            : 0,

        track_type:
          "Double-Electrified"
      });
    }


    map.set(
      numberValue,
      {

        train_number:
          numberValue,

        train_name:
          clean(
            rawTrain.trainName ||
            rawTrain.name ||
            `Train ${numberValue}`
          ),

        category,

        train_priority:
          priority,

        route,

        sections
      }
    );
  }


  return [...map.values()];
}


// ============================================================
// CREATE STATIONS
// ============================================================

function buildStations(
  trainFiles,
  coordinateMap
) {

  const stations = new Map();


  for (
    const rawTrain of trainFiles
  ) {

    const route =
      Array.isArray(
        rawTrain.trainRoute
      )
        ? rawTrain.trainRoute
        : [];


    for (
      const rawStation of route
    ) {

      const parsed =
        parseStation(
          rawStation.stationName ||
          rawStation.name ||
          rawStation.station ||
          rawStation
        );


      if (!parsed.code) {
        continue;
      }


      if (stations.has(parsed.code)) {
        continue;
      }


      /*
       * Try coordinate lookup by station name.
       */

      const coordinates =
        coordinateMap.get(
          parsed.name.toUpperCase()
        );


      stations.set(
        parsed.code,
        {

          code:
            parsed.code,

          name:
            parsed.name,

          lat:
            coordinates?.lat ??
            null,

          lon:
            coordinates?.lon ??
            null,

          junction_complexity:
            randomInt(1, 3)
        }
      );
    }
  }


  /*
   * Some stations may have coordinates in
   * train_data but weren't parsed from JSON.
   */

  for (
    const [name, coordinate]
    of coordinateMap.entries()
  ) {

    const station =
      parseStation(name);

    if (
      !station.code ||
      stations.has(station.code)
    ) {
      continue;
    }


    stations.set(
      station.code,
      {

        code:
          station.code,

        name:
          station.name,

        lat:
          coordinate.lat,

        lon:
          coordinate.lon,

        junction_complexity:
          randomInt(1, 3)
      }
    );
  }


  return [...stations.values()];
}


// ============================================================
// CREATE DELAY LOGS
// ============================================================

function buildDelayLogs(
  observations,
  trainMap
) {

  const logs = [];


  /*
   * First preserve actual observation records.
   */

  for (
    const row of observations
  ) {

    const trainNumber =
      clean(row.train_number);

    if (!trainNumber) {
      continue;
    }


    const station =
      parseStation(
        clean(row.station_name)
      );


    let delay =
      number(
        row.delay_minutes
      );


    /*
     * For the SIH prototype we want a
     * realistic 70/30 operational distribution.
     *
     * Existing non-zero delays are preserved.
     */

    if (delay <= 0) {

      if (delayedRecord()) {

        delay =
          generateDelay(row);

      } else {

        delay = 0;
      }
    }


    logs.push({

      train_number:
        trainNumber,

      station_code:
        station.code ||
        clean(row.station_name)
          .substring(0, 5)
          .toUpperCase(),

      delay_minutes:
        delay,

      logged_at:
        row.logged_at &&
        row.logged_at !== "########"
          ? new Date(row.logged_at)
          : new Date(),

      source:
        number(row.delay_minutes) > 0
          ? "RAW_OBSERVATION"
          : delay > 0
            ? "SYNTHETIC_SEED"
            : "RAW_OBSERVATION",

      reason:
        delay > 0
          ? randomDelayReason()
          : "On time"
    });
  }


  /*
   * Generate additional observations so
   * the dashboard has enough historical data.
   */

  const trainNumbers =
    [...trainMap.keys()];


  if (trainNumbers.length === 0) {
    return logs;
  }


  const existingCount =
    logs.length;


  /*
   * Generate approximately 3 observations
   * per train.
   */

  const targetCount =
    Math.max(
      existingCount,
      trainNumbers.length * 3
    );


  while (
    logs.length < targetCount
  ) {

    const trainNumber =
      trainNumbers[
        randomInt(
          0,
          trainNumbers.length - 1
        )
      ];


    const train =
      trainMap.get(trainNumber);


    const route =
      train?.route || [];


    if (route.length === 0) {
      continue;
    }


    const stationCode =
      route[
        randomInt(
          0,
          route.length - 1
        )
      ];


    const delayed =
      delayedRecord();


    const delay =
      delayed
        ? generateDelay()
        : 0;


    logs.push({

      train_number:
        trainNumber,

      station_code:
        stationCode,

      delay_minutes:
        delay,

      logged_at:
        new Date(
          Date.now() -
          randomInt(
            0,
            72
          ) * 60 * 60 * 1000
        ),

      source:
        "SYNTHETIC_SEED",

      reason:
        delayed
          ? randomDelayReason()
          : "On time"
    });
  }


  return logs;
}


// ============================================================
// DELAY REASONS
// ============================================================

function randomDelayReason() {

  const reasons = [

    "Signal congestion",

    "Preceding train delay",

    "Temporary speed restriction",

    "Operational congestion",

    "Unscheduled stoppage",

    "Level crossing delay",

    "Weather conditions",

    "Platform congestion",

    "Route regulation",

    "Crew operational delay"

  ];


  return reasons[
    randomInt(
      0,
      reasons.length - 1
    )
  ];
}


// ============================================================
// LIVE POSITIONS
// ============================================================

function buildLivePositions(
  trains,
  delayLogs
) {

  const positions = [];


  for (
    const train of trains
  ) {

    const routeLength =
      train.route.length;


    if (routeLength === 0) {
      continue;
    }


    const logs =
      delayLogs.filter(
        log =>
          log.train_number ===
          train.train_number
      );


    const latest =
      logs.length
        ? logs[
            logs.length - 1
          ]
        : null;


    const delay =
      latest
        ? latest.delay_minutes
        : (
            delayedRecord()
              ? generateDelay()
              : 0
          );


    const routeIdx =
      randomInt(
        0,
        Math.max(
          0,
          routeLength - 2
        )
      );


    /*
     * Create a realistic delay history.
     */

    const history = [];


    let current =
      Math.max(
        0,
        delay
      );


    for (
      let i = 0;
      i < 5;
      i++
    ) {

      history.unshift(
        Math.max(
          0,
          Math.round(
            current +
            randomInt(-4, 4)
          )
        )
      );
    }


    history.push(
      Math.round(delay)
    );


    positions.push({

      train_number:
        train.train_number,

      route_idx:
        routeIdx,

      delay_minutes:
        Math.round(delay),

      updated_at:
        new Date(),

      delay_history:
        history.slice(-10)
    });
  }


  return positions;
}


// ============================================================
// FEEDER CONNECTIONS
// ============================================================

function buildFeeders(
  trains,
  stations
) {

  const feeders = [];


  const services = [

    "City Bus",

    "Airport Shuttle",

    "Metro Connector",

    "Intercity Bus",

    "Local Train",

    "Shared Taxi",

    "Railway Shuttle",

    "Feeder Bus"

  ];


  const stationList =
    stations.map(
      station => station.code
    );


  /*
   * Generate feeder connections for
   * several trains.
   */

  const shuffledTrains =
    shuffle(trains);


  const count =
    Math.min(
      100,
      shuffledTrains.length * 2
    );


  for (
    let i = 0;
    i < count;
    i++
  ) {

    const train =
      shuffledTrains[
        i %
        shuffledTrains.length
      ];


    if (
      !train.route ||
      train.route.length === 0
    ) {
      continue;
    }


    const station =
      train.route[
        randomInt(
          0,
          train.route.length - 1
        )
      ];


    const hour =
      randomInt(
        5,
        22
      );


    const minute =
      randomInt(
        0,
        59
      );


    const time =
      `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;


    const buffer =
      randomInt(
        5,
        15
      );


    feeders.push({

      station_code:
        station,

      train_number:
        train.train_number,

      connecting_service:
        `${services[
          randomInt(
            0,
            services.length - 1
          )
        ]} #${randomInt(1, 99)}`,

      connection_departure_time:
        time,

      adjusted_departure_time:
        time,

      min_buffer_minutes:
        buffer
    });
  }


  return feeders;
}


// ============================================================
// STATION OPERATIONS
// ============================================================

function buildStationOperations(
  stations,
  trains
) {

  const operations = [];


  for (
    const station of stations
  ) {

    const assignments = {};


    /*
     * Find trains passing through station.
     */

    const stationTrains =
      trains.filter(
        train =>
          train.route.includes(
            station.code
          )
      );


    /*
     * Give platforms to a few trains.
     */

    for (
      const train of stationTrains.slice(
        0,
        8
      )
    ) {

      assignments[
        train.train_number
      ] =
        `Platform ${randomInt(
          1,
          8
        )}`;
    }


    operations.push({

      station_code:
        station.code,

      platform_assignments:
        assignments,

      announcements: [

        {

          message:
            `${station.name}: Passenger information and train movement update.`,

          created_at:
            new Date(),

          created_by:
            "SYSTEM"
        }

      ]
    });
  }


  return operations;
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log(
    "\n======================================"
  );

  console.log(
    "RAILWAY ETA DATABASE POPULATOR"
  );

  console.log(
    "======================================\n"
  );


  /*
   * Connect MongoDB
   */

  await connectDB();


  /*
   * Read files
   */

  console.log(
    "Reading train JSON files..."
  );


  const trainFiles =
    loadTrainFiles();


  console.log(
    "\nReading observation CSV..."
  );


  const observations =
    await readCSV(
      OBSERVATION_FILE
    );


  console.log(
    `Observations: ${observations.length}`
  );


  console.log(
    "\nReading training CSV..."
  );


  const trainingRows =
    await readCSV(
      TRAIN_DATA_FILE
    );


  console.log(
    `Training rows: ${trainingRows.length}`
  );


  /*
   * Build data
   */

  console.log(
    "\nBuilding trains..."
  );


  const trains =
    buildTrains(
      trainFiles
    );


  const trainMap =
    new Map(
      trains.map(
        train =>
          [
            train.train_number,
            train
          ]
      )
    );


  console.log(
    `Trains: ${trains.length}`
  );


  /*
   * Coordinates
   */

  console.log(
    "\nBuilding station coordinates..."
  );


  const coordinateMap =
    buildCoordinateMap(
      observations,
      trainingRows
    );


  /*
   * Stations
   */

  const stations =
    buildStations(
      trainFiles,
      coordinateMap
    );


  console.log(
    `Stations: ${stations.length}`
  );


  /*
   * Delay logs
   */

  console.log(
    "\nBuilding delay logs..."
  );


  const delayLogs =
    buildDelayLogs(
      observations,
      trainMap
    );


  const delayed =
    delayLogs.filter(
      x =>
        x.delay_minutes > 0
    ).length;


  console.log(
    `Delay logs: ${delayLogs.length}`
  );

  console.log(
    `Delayed: ${delayed}`
  );

  console.log(
    `On time: ${
      delayLogs.length - delayed
    }`
  );

  console.log(
    `Delay percentage: ${
      (
        delayed /
        Math.max(
          1,
          delayLogs.length
        )
      * 100
      ).toFixed(2)
    }%`
  );


  /*
   * Live positions
   */

  console.log(
    "\nBuilding live positions..."
  );


  const livePositions =
    buildLivePositions(
      trains,
      delayLogs
    );


  console.log(
    `Live positions: ${livePositions.length}`
  );


  /*
   * Feeders
   */

  console.log(
    "\nBuilding feeder connections..."
  );


  const feeders =
    buildFeeders(
      trains,
      stations
    );


  console.log(
    `Feeders: ${feeders.length}`
  );


  /*
   * Station operations
   */

  console.log(
    "\nBuilding station operations..."
  );


  const stationOperations =
    buildStationOperations(
      stations,
      trains
    );


  console.log(
    `Station operations: ${
      stationOperations.length
    }`
  );


  // ========================================================
  // DATABASE INSERT
  // ========================================================

  console.log(
    "\nClearing operational collections..."
  );


  await Promise.all([

    Train.deleteMany({}),

    Station.deleteMany({}),

    LivePosition.deleteMany({}),

    DelayLog.deleteMany({}),

    FeederConnection.deleteMany({}),

    StationOperation.deleteMany({})

  ]);


  console.log(
    "Inserting trains..."
  );

  await Train.insertMany(
    trains
  );


  console.log(
    "Inserting stations..."
  );

  await Station.insertMany(
    stations
  );


  console.log(
    "Inserting live positions..."
  );

  await LivePosition.insertMany(
    livePositions
  );


  console.log(
    "Inserting delay logs..."
  );

  await DelayLog.insertMany(
    delayLogs
  );


  console.log(
    "Inserting feeder connections..."
  );

  await FeederConnection.insertMany(
    feeders
  );


  console.log(
    "Inserting station operations..."
  );

  await StationOperation.insertMany(
    stationOperations
  );


  // ========================================================
  // FINISHED
  // ========================================================

  console.log(
    "\n======================================"
  );

  console.log(
    "DATABASE POPULATION COMPLETE"
  );

  console.log(
    "======================================"
  );


  console.log(
    `Trains:              ${trains.length}`
  );

  console.log(
    `Stations:            ${stations.length}`
  );

  console.log(
    `Live positions:      ${livePositions.length}`
  );

  console.log(
    `Delay logs:          ${delayLogs.length}`
  );

  console.log(
    `Feeder connections:  ${feeders.length}`
  );

  console.log(
    `Station operations:  ${stationOperations.length}`
  );


  console.log(
    "\nTraining collection was NOT deleted."
  );

  console.log(
    "Your existing traintrainingdatas data remains intact."
  );


  await mongoose.disconnect();

  console.log(
    "\nMongoDB connection closed."
  );
}


main().catch(
  async error => {

    console.error(
      "\nDATABASE POPULATION FAILED"
    );

    console.error(error);

    try {
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
);