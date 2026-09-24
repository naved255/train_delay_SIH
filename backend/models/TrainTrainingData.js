import mongoose from "mongoose";

const trainTrainingDataSchema = new mongoose.Schema(
  {
    logged_at: {
      type: Date,
      required: true,
    },

    journey_date: {
      type: Date,
      required: true,
    },

    actual_station_date: {
      type: Date,
    },

    train_number: {
      type: String,
      required: true,
      index: true,
    },

    last_station: {
      type: String,
    },

    station_name: {
      type: String,
      required: true,
    },

    scheduled_arrival: {
      type: String,
    },

    scheduled_departure: {
      type: String,
    },

    delay_minutes: {
      type: Number,
      default: 0,
    },

    distance_km: {
      type: Number,
      default: 0,
    },

    latitude: {
      type: Number,
    },

    longitude: {
      type: Number,
    },

    precipitation_sum: {
      type: Number,
      default: 0,
    },

    is_fog_day: {
      type: Number,
      default: 0,
    },

    next_station: {
      type: String,
    },

    target_delay_at_next_station: {
      type: Number,
      default: 0,
    },

    delay_trend_last3: {
      type: Number,
      default: 0,
    },

    track_type: {
      type: String,
    },

    level_crossings: {
      type: Number,
      default: 0,
    },

    is_ghat: {
      type: Number,
      default: 0,
    },

    sched_speed_kmh: {
      type: Number,
      default: 0,
    },

    section_distance_km: {
      type: Number,
      default: 0,
    },

    hist_avg_train_station_delay: {
      type: Number,
      default: 0,
    },

    hist_avg_station_delay: {
      type: Number,
      default: 0,
    },

    day_of_week: {
      type: Number,
    },

    hour_of_day: {
      type: Number,
    },

    is_weekend: {
      type: Number,
      default: 0,
    },

    category: {
      type: String,
    },

    train_priority: {
      type: Number,
    },

    coach_count: {
      type: Number,
    },

    origin_dest_duration_min: {
      type: Number,
    },

    junction_complexity: {
      type: Number,
    },

    is_festival_season: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

trainTrainingDataSchema.index({ train_number: 1, logged_at: -1 });
trainTrainingDataSchema.index({ station_name: 1, logged_at: -1 });
trainTrainingDataSchema.index({ logged_at: -1 });

export default mongoose.model(
  "TrainTrainingData",
  trainTrainingDataSchema
);