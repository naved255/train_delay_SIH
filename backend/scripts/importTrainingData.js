import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import csv from "csv-parser";
import dotenv from "dotenv";

import TrainTrainingData from "../models/TrainTrainingData.js";

dotenv.config();

const CSV_FILE = path.resolve(
  "data/train_data.csv"
);

const MONGO_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/railway_eta";


// ----------------------------------------------------
// Utility functions
// ----------------------------------------------------

function number(value, defaultValue = 0) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "########"
  ) {
    return defaultValue;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : defaultValue;
}


function cleanString(value) {
  if (
    value === undefined ||
    value === null ||
    value === "########"
  ) {
    return "";
  }

  return String(value).trim();
}


// ----------------------------------------------------
// Generate realistic delay
// ----------------------------------------------------

function generateDelay(row) {

  /*
    We don't want completely random delays.

    Delay probability:
      70% -> delayed
      30% -> on time

    Delay magnitude is influenced by:
      - level crossings
      - ghat section
      - junction complexity
      - precipitation
      - fog
      - historical delay
      - section distance
  */

  const delayed = Math.random() < 0.70;

  if (!delayed) {
    return 0;
  }

  let delay = 3 + Math.random() * 8;

  // Level crossings
  delay += number(row.level_crossings) * 0.15;

  // Ghat section
  if (number(row.is_ghat) === 1) {
    delay += 2 + Math.random() * 5;
  }

  // Junction complexity
  delay += number(row.junction_complexity) * 0.7;

  // Weather
  delay += number(row.precipitation_sum) * 0.5;

  if (number(row.is_fog_day) === 1) {
    delay += 2 + Math.random() * 4;
  }

  // Historical delay
  delay += number(row.hist_avg_train_station_delay) * 0.5;

  delay += number(row.hist_avg_station_delay) * 0.3;

  // Longer sections can accumulate more delay
  const sectionDistance =
    number(row.section_distance_km);

  if (sectionDistance > 200) {
    delay += 2;
  }

  // Random operational variation
  delay += Math.random() * 5;

  return Math.max(
    1,
    Math.round(delay)
  );
}


// ----------------------------------------------------
// Main importer
// ----------------------------------------------------

async function importData() {

  try {

    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected.");

    const rows = [];

    fs.createReadStream(CSV_FILE)
      .pipe(
        csv({
          mapHeaders: ({ header }) =>
            header.trim(),
        }),
      )
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", async () => {

        console.log(
          `CSV loaded: ${rows.length} rows`
        );

        if (rows.length === 0) {
          console.log("CSV contains no rows.");
          process.exit(0);
        }

        const documents = [];

        /*
          -------------------------------------------------
          IMPORTANT

          We maintain delay propagation within a train.

          This means if train 1025 gets delayed at KYN,
          that delay can influence its next station.
          -------------------------------------------------
        */

        const previousDelayByTrain = {};

        for (const row of rows) {

          const trainNumber =
            cleanString(row.train_number);

          const previousDelay =
            previousDelayByTrain[trainNumber] || 0;

          let currentDelay =
            generateDelay(row);

          /*
            Delay propagation.

            If previous station already had a significant
            delay, part of it carries forward.
          */

          if (previousDelay > 0) {

            const propagation =
              Math.random() * 0.75;

            currentDelay += Math.round(
              previousDelay * propagation
            );
          }

          currentDelay = Math.max(
            0,
            Math.round(currentDelay)
          );

          previousDelayByTrain[trainNumber] =
            currentDelay;


          /*
            Target delay at next station.

            Normally delay changes slightly between
            stations rather than jumping randomly.
          */

          let targetDelay =
            currentDelay;

          if (currentDelay > 0) {

            const variation =
              Math.round(
                (Math.random() - 0.35) * 5
              );

            targetDelay =
              Math.max(
                0,
                currentDelay + variation
              );

          } else {

            /*
              Sometimes a train currently on time
              develops a small delay at the next section.
            */

            if (Math.random() < 0.15) {
              targetDelay =
                Math.floor(
                  Math.random() * 5
                );
            }
          }


          /*
            delay trend

            Positive  -> delay increasing
            Negative  -> delay recovering
            Zero      -> stable
          */

          const trend =
            targetDelay - currentDelay;


          const document = {

            logged_at:
              row.logged_at &&
              row.logged_at !== "########"
                ? new Date(row.logged_at)
                : new Date(),

            journey_date:
              row.journey_date &&
              row.journey_date !== "########"
                ? new Date(row.journey_date)
                : new Date(),

            actual_station_date:
              row.actual_station_date &&
              row.actual_station_date !== "########"
                ? new Date(row.actual_station_date)
                : null,

            train_number: trainNumber,

            last_station:
              cleanString(row.last_station),

            station_name:
              cleanString(row.station_name),

            scheduled_arrival:
              cleanString(row.scheduled_arrival),

            scheduled_departure:
              cleanString(row.scheduled_departure),

            delay_minutes:
              currentDelay,

            distance_km:
              number(row.distance_km),

            latitude:
              number(row.latitude, null),

            longitude:
              number(row.longitude, null),

            precipitation_sum:
              number(row.precipitation_sum),

            is_fog_day:
              number(row.is_fog_day),

            next_station:
              cleanString(row.next_station),

            target_delay_at_next_station:
              targetDelay,

            delay_trend_last3:
              trend,

            track_type:
              cleanString(row.track_type),

            level_crossings:
              number(row.level_crossings),

            is_ghat:
              number(row.is_ghat),

            sched_speed_kmh:
              number(row.sched_speed_kmh),

            section_distance_km:
              number(row.section_distance_km),

            hist_avg_train_station_delay:
              number(
                row.hist_avg_train_station_delay
              ),

            hist_avg_station_delay:
              number(
                row.hist_avg_station_delay
              ),

            day_of_week:
              number(row.day_of_week),

            hour_of_day:
              number(row.hour_of_day),

            is_weekend:
              number(row.is_weekend),

            category:
              cleanString(row.category),

            train_priority:
              number(row.train_priority),

            coach_count:
              number(row.coach_count),

            origin_dest_duration_min:
              number(
                row.origin_dest_duration_min
              ),

            junction_complexity:
              number(
                row.junction_complexity
              ),

            is_festival_season:
              number(row.is_festival_season),
          };

          documents.push(document);
        }


        console.log(
          `Preparing ${documents.length} documents...`
        );


        /*
          -------------------------------------------------
          Insert into MongoDB
          -------------------------------------------------
        */

        await TrainTrainingData.deleteMany({});

        await TrainTrainingData.insertMany(
          documents,
          {
            ordered: false,
          }
        );


        /*
          -------------------------------------------------
          Statistics
          -------------------------------------------------
        */

        const delayedCount =
          documents.filter(
            (x) => x.delay_minutes > 0
          ).length;

        const zeroDelayCount =
          documents.filter(
            (x) => x.delay_minutes === 0
          ).length;

        const percentage =
          (
            delayedCount /
            documents.length
          ) * 100;


        console.log("\n==============================");
        console.log("IMPORT COMPLETED");
        console.log("==============================");

        console.log(
          `Total rows: ${documents.length}`
        );

        console.log(
          `Delayed rows: ${delayedCount}`
        );

        console.log(
          `Zero-delay rows: ${zeroDelayCount}`
        );

        console.log(
          `Delayed percentage: ${percentage.toFixed(2)}%`
        );

        console.log("==============================\n");

        await mongoose.disconnect();

        process.exit(0);
      });

  } catch (error) {

    console.error(
      "Import failed:",
      error
    );

    await mongoose.disconnect();

    process.exit(1);
  }
}


importData();