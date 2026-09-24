import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Train,
  Clock,
  MapPin,
  ShieldCheck,
  BrainCircuit,
  TrendingUp,
  CheckCircle2,
  Navigation,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import MapView from "../components/MapView";
import { getRunningTrains, getTrainForecast, getTrainPredict } from "../api";

export default function PassengerView() {
  const [trains, setTrains] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);

  const load = async () => {
    try {
      setError("");

      const response = await getRunningTrains({ limit: 100 });
      const data = Array.isArray(response)
        ? response
        : response?.data || [];

      if (!Array.isArray(data)) {
        throw new Error("Backend returned an unexpected response format.");
      }

      setTrains(data);

      setSelected(
        (prev) => data.find((t) => t.id === prev?.id) || data[0] || null
      );
    } catch (e) {
      console.error("[PassengerView] Failed to load trains:", e);

      const status = e.response?.status
        ? ` (HTTP ${e.response.status})`
        : "";

      const detail =
        e.response?.data?.detail ||
        e.response?.data?.message ||
        e.message;

      setError(
        `Could not fetch train data from backend${status}: ${
          detail || "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    const id = setInterval(load, 8000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!selected?.trainNumber) {
      setForecast(null);
      setPrediction(null);
      return () => {};
    }

    setForecast(null);
    setPrediction(null);
    setPredictionLoading(true);

    Promise.allSettled([
      getTrainForecast(selected.trainNumber),
      getTrainPredict(selected.trainNumber),
    ]).then(([forecastResult, predictionResult]) => {
      if (cancelled) return;

      if (forecastResult.status === "fulfilled") {
        setForecast(forecastResult.value);
      }

      if (predictionResult.status === "fulfilled") {
        setPrediction(predictionResult.value);
      }
    }).finally(() => {
      if (!cancelled) setPredictionLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selected?.trainNumber, selected?.updatedAt]);

  const filtered = useMemo(
    () =>
      trains.filter((t) => {
        const q = search.toLowerCase();

        const match =
          t.trainName.toLowerCase().includes(q) ||
          t.trainNumber.includes(q);

        if (filter === "ON_TIME") {
          return match && t.currentDelay <= 10;
        }

        if (filter === "DELAYED") {
          return match && t.currentDelay > 10;
        }

        return match;
      }),
    [trains, search, filter]
  );

  const avgDelay = trains.length
    ? Math.round(
        trains.reduce((sum, t) => sum + t.currentDelay, 0) /
          trains.length
      )
    : 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Train className="w-6 h-6" />
              </div>

              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-900">
                  Live Train Status
                </h1>

                <p className="text-sm text-slate-500">
                  Track running trains and expected arrival times
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-slate-400">
                  Live updates
                </p>

                <p className="text-sm font-medium text-emerald-600">
                  Updated automatically
                </p>
              </div>

              <button
                onClick={load}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg
                border border-slate-200 bg-white text-sm font-medium
                text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-5">

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
            <div>
              <p className="font-semibold">Unable to load train information</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Running trains
            </p>

            <p className="mt-1 text-2xl font-bold text-slate-900">
              {trains.length}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Average delay
            </p>

            <p
              className={`mt-1 text-2xl font-bold ${
                avgDelay > 10
                  ? "text-red-600"
                  : "text-emerald-600"
              }`}
            >
              {avgDelay} min
            </p>
          </div>

          <div className="hidden md:block bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Status
            </p>

            <div className="flex items-center gap-2 mt-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-sm font-semibold text-slate-700">
                Live tracking active
              </span>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Train List */}
          <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">

            <div className="p-4 border-b border-slate-200">
              <h2 className="font-bold text-slate-900">
                Running Trains
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                Select a train to view its current location
              </p>

              {/* Search */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by train number or name"
                  className="w-full bg-slate-50 border border-slate-200
                  rounded-lg pl-9 pr-3 py-2.5 text-sm
                  text-slate-900 placeholder:text-slate-400
                  focus:outline-none focus:ring-2 focus:ring-emerald-500/20
                  focus:border-emerald-500"
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2 mt-3">
                {[
                  ["ALL", "All trains"],
                  ["ON_TIME", "On time"],
                  ["DELAYED", "Delayed"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      filter === value
                        ? value === "DELAYED"
                          ? "bg-red-600 text-white"
                          : "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="h-[610px] overflow-y-auto">

              {loading && (
                <div className="p-8 text-center text-sm text-slate-500">
                  Loading live train information...
                </div>
              )}

              {!loading && !filtered.length && (
                <div className="p-8 text-center">
                  <Train className="w-8 h-8 mx-auto text-slate-300" />

                  <p className="mt-3 text-sm font-medium text-slate-600">
                    No trains found
                  </p>

                  <p className="text-xs text-slate-400 mt-1">
                    Try another train number or name
                  </p>
                </div>
              )}

              <div className="divide-y divide-slate-100">
                {filtered.map((t) => {

                  const delayed = t.currentDelay > 10;
                  const active = selected?.id === t.id;

                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`w-full text-left p-4 transition ${
                        active
                          ? "bg-emerald-50 border-l-4 border-emerald-600"
                          : "hover:bg-slate-50 border-l-4 border-transparent"
                      }`}
                    >
                      {/* Train name */}
                      <div className="flex items-start justify-between gap-3">

                        <div>
                          <p className="text-xs font-semibold text-emerald-700">
                            {t.trainNumber}
                          </p>

                          <h3 className="mt-0.5 font-semibold text-slate-900">
                            {t.trainName}
                          </h3>
                        </div>

                        <span
                          className={`shrink-0 text-[11px] font-semibold
                          px-2 py-1 rounded-full ${
                            delayed
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>

                      {/* Route */}
                      <div className="flex items-center gap-2 mt-3 text-xs">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />

                        <span className="font-medium text-slate-700 truncate">
                          {t.currentStation}
                        </span>

                        <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />

                        <span className="font-medium text-slate-700 truncate">
                          {t.nextStation}
                        </span>
                      </div>

                      {/* ETA */}
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-slate-500">
                          Expected arrival
                        </span>

                        <span className="text-sm font-bold text-emerald-700">
                          {t.predictedETA}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Right Side */}
          <section className="lg:col-span-8 space-y-5">

            {/* Map */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-600" />

                <div>
                  <h2 className="font-semibold text-slate-900">
                    Live Train Location
                  </h2>

                  <p className="text-xs text-slate-500">
                    Current location of running trains
                  </p>
                </div>
              </div>

              <MapView
                trains={trains}
                selectedTrainId={selected?.id}
                onSelectTrain={setSelected}
              />
            </div>

            {/* Selected Train */}
            {selected && (
              <>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

                  {/* Selected Header */}
                  <div className="p-5 border-b border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                      <div>
                        <p className="text-xs font-semibold text-emerald-700">
                          TRAIN {selected.trainNumber}
                        </p>

                        <h2 className="text-xl font-bold text-slate-900 mt-1">
                          {selected.trainName}
                        </h2>
                      </div>

                      <div
                        className={`inline-flex w-fit items-center gap-2
                        px-3 py-1.5 rounded-full text-xs font-semibold ${
                          selected.currentDelay > 10
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            selected.currentDelay > 10
                              ? "bg-red-500"
                              : "bg-emerald-500"
                          }`}
                        />

                        {selected.currentDelay > 10
                          ? `Delayed by ${selected.currentDelay} min`
                          : "Running on time"}
                      </div>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="p-5">

                    <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">

                      <div>
                        <p className="text-xs text-slate-500">
                          Current station
                        </p>

                        <div className="flex items-center gap-2 mt-1">
                          <MapPin className="w-4 h-4 text-emerald-600" />

                          <p className="font-semibold text-slate-900">
                            {selected.currentStation}
                          </p>
                        </div>
                      </div>

                      <div className="hidden md:flex items-center gap-2">
                        <div className="h-px flex-1 bg-slate-200" />

                        <Train className="w-5 h-5 text-emerald-600" />

                        <div className="h-px flex-1 bg-slate-200" />
                      </div>

                      <div className="md:text-right">
                        <p className="text-xs text-slate-500">
                          Next station
                        </p>

                        <div className="flex md:justify-end items-center gap-2 mt-1">
                          <p className="font-semibold text-slate-900">
                            {selected.nextStation}
                          </p>

                          <MapPin className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                    </div>

                    {/* Info Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">

                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-xs text-slate-500">
                          Current speed
                        </p>

                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {selected.speed} km/h
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-xs text-slate-500">
                          Expected arrival
                        </p>

                        <p className="mt-1 text-lg font-bold text-emerald-700">
                          {selected.predictedETA}
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-xs text-slate-500">
                          Delay
                        </p>

                        <p
                          className={`mt-1 text-lg font-bold ${
                            selected.currentDelay > 10
                              ? "text-red-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {selected.currentDelay
                            ? `+${selected.currentDelay} min`
                            : "On time"}
                        </p>
                      </div>

                    </div>

                    {/* Status Message */}
                    {selected.topReason && (
                      <div className="flex items-start gap-2 mt-5 pt-4 border-t border-slate-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />

                        <p className="text-sm text-slate-600">
                          {selected.topReason}
                        </p>
                      </div>
                    )}

                  </div>
                </div>

                {/* ML Delay Intelligence */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-violet-600" />
                        <h2 className="font-semibold text-slate-900">
                          AI Delay Prediction
                        </h2>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        LightGBM quantile prediction with SHAP explanation
                      </p>
                    </div>

                    {prediction?.model_source && (
                      <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-violet-50 text-violet-700">
                        {prediction.model_source.includes("lightgbm") ? "LightGBM" : "Fallback"}
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    {predictionLoading && (
                      <div className="py-8 text-center text-sm text-slate-500">
                        Calculating delay range and explanation...
                      </div>
                    )}

                    {!predictionLoading && prediction && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="rounded-lg bg-emerald-50 p-4">
                            <p className="text-xs text-slate-500">P5 · Optimistic</p>
                            <p className="mt-1 text-xl font-bold text-emerald-700">
                              +{prediction.p5_minutes} min
                            </p>
                          </div>

                          <div className="rounded-lg bg-blue-50 p-4">
                            <p className="text-xs text-slate-500">P50 · Expected</p>
                            <p className="mt-1 text-xl font-bold text-blue-700">
                              +{prediction.p50_minutes} min
                            </p>
                          </div>

                          <div className="rounded-lg bg-red-50 p-4">
                            <p className="text-xs text-slate-500">P95 · Worst-case</p>
                            <p className="mt-1 text-xl font-bold text-red-700">
                              +{prediction.p95_minutes} min
                            </p>
                          </div>

                          <div className="rounded-lg bg-slate-50 p-4">
                            <p className="text-xs text-slate-500">Delay probability</p>
                            <p className="mt-1 text-xl font-bold text-slate-900">
                              {prediction.delay_probability_percent ?? "—"}%
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/50 p-4">
                          <div className="flex items-start gap-3">
                            <TrendingUp className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-violet-800 uppercase tracking-wide">
                                Why this prediction?
                              </p>
                              <p className="text-sm text-slate-700 mt-1">
                                {prediction.top_reason}
                              </p>
                            </div>
                          </div>
                        </div>

                        {prediction.shap?.length > 0 && (
                          <div className="mt-5">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900">Top contributing factors</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Positive bars increase predicted delay; negative bars reduce it.</p>
                              </div>
                            </div>

                            <div className="space-y-3">
                              {prediction.shap.slice(0, 6).map((factor) => {
                                const maxImpact = Math.max(
                                  ...prediction.shap.map((item) => Math.abs(Number(item.impact || 0))),
                                  0.001
                                );
                                const width = Math.max(4, Math.round((Math.abs(Number(factor.impact || 0)) / maxImpact) * 100));
                                const positive = Number(factor.impact || 0) >= 0;

                                return (
                                  <div key={factor.feature}>
                                    <div className="flex items-center justify-between gap-3 text-xs mb-1">
                                      <span className="font-medium text-slate-700 truncate">
                                        {factor.label}
                                      </span>
                                      <span className={`shrink-0 font-semibold ${positive ? "text-red-600" : "text-blue-600"}`}>
                                        {positive ? "+" : ""}{Number(factor.impact || 0).toFixed(2)}
                                      </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${positive ? "bg-red-400" : "bg-blue-400"}`}
                                        style={{ width: `${width}%` }}
                                      />
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-1">Observed value: {factor.value}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {!predictionLoading && !prediction && (
                      <div className="py-6 text-center text-sm text-slate-500">
                        Prediction service is unavailable for this train. Live ETA remains available.
                      </div>
                    )}
                  </div>
                </div>

                {/* Forecast */}
                {forecast?.forecast?.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

                    <div className="p-4 border-b border-slate-200">
                      <h2 className="font-semibold text-slate-900">
                        Upcoming Stations
                      </h2>

                      <p className="text-xs text-slate-500 mt-1">
                        Expected arrival times for the next stations
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">

                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Station
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Expected arrival
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Delay
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Updated
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                          {forecast.forecast
                            .slice(0, 8)
                            .map((row) => (
                              <tr
                                key={row.stationCode}
                                className="hover:bg-slate-50"
                              >
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-900">
                                    {row.stationName}
                                  </p>

                                  <p className="text-xs text-slate-400">
                                    {row.stationCode}
                                  </p>
                                </td>

                                <td className="px-4 py-3 font-semibold text-emerald-700">
                                  {row.predictedETA}
                                </td>

                                <td className="px-4 py-3">
                                  <span
                                    className={
                                      row.predictedDelayMinutes > 10
                                        ? "text-red-600 font-medium"
                                        : "text-slate-600"
                                    }
                                  >
                                    {row.predictedDelayMinutes
                                      ? `+${row.predictedDelayMinutes} min`
                                      : "On time"}
                                  </span>
                                </td>

                                <td className="px-4 py-3 text-xs text-slate-400">
                                  {new Date(
                                    forecast.updatedAt
                                  ).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </td>
                              </tr>
                            ))}
                        </tbody>

                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}



