import React, { useEffect, useState } from "react";
import {
  Bus,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Train,
} from "lucide-react";
import { getFeeder, syncFeeder } from "../api";

const PLATFORMS = [
  "Platform 1",
  "Platform 2",
  "Platform 3",
  "Platform 4",
  "Platform 5",
  "Platform 7",
  "Platform 16",
];

export default function FeederView() {
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);

    try {
      setError("");

      const d = await getFeeder();
      const safe = Array.isArray(d) ? d : [];

      setServices(safe);

      setSelected((previous) =>
        safe.find((x) => x.id === previous?.id) ||
        safe[0] ||
        null
      );
    } catch (e) {
      setError(
        e.response?.data?.message ||
          "Feeder data is temporarily unavailable. The dashboard will retry automatically."
      );
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    let timer;

    const poll = async () => {
      await load(true);

      if (active) {
        timer = setTimeout(poll, 10000);
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const sync = async () => {
    if (!selected) return;

    setSyncing(true);
    setError("");
    setNotice("");

    try {
      const updated = await syncFeeder(
        selected.trainNumber
      );

      setSelected(updated);

      setNotice(
        "Feeder departure synchronized with the latest backend ETA."
      );

      await load(false);
    } catch (e) {
      setError(
        e.response?.data?.message ||
          "Feeder sync failed."
      );
    } finally {
      setSyncing(false);
    }
  };

  const rescheduled = services.filter(
    (s) => s.syncStatus === "RESCHEDULED"
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-[1600px] mx-auto">
        {/* HEADER */}
        <header className="bg-white border-b border-slate-200">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-600 flex items-center justify-center">
                  <Bus className="w-5 h-5 text-white" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                      Feeder Transport
                    </h1>

                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
                      OPERATIONS
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Coordinate connecting services with predicted train arrivals
                  </p>
                </div>
              </div>

              <button
                onClick={() => load(true)}
                disabled={loading}
                className="
                  inline-flex items-center justify-center gap-2
                  px-3 py-2
                  bg-white
                  border border-slate-300
                  rounded-lg
                  text-sm font-medium text-slate-700
                  hover:bg-slate-50
                  transition
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                "
              >
                <RefreshCw
                  className={
                    loading
                      ? "w-4 h-4 animate-spin"
                      : "w-4 h-4"
                  }
                />

                Refresh
              </button>
            </div>

            {/* SUMMARY */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
              <Stat
                icon={Bus}
                label="Connections"
                value={services.length}
              />

              <Stat
                icon={AlertTriangle}
                label="Need reschedule"
                value={rescheduled}
                tone="amber"
              />

              <Stat
                icon={CheckCircle2}
                label="Synchronized"
                value={Math.max(
                  services.length - rescheduled,
                  0
                )}
                tone="green"
              />
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-5">
          {/* NOTIFICATION */}
          {(notice || error) && (
            <div
              className={`
                flex items-start gap-3
                px-4 py-3
                rounded-lg
                border
                text-sm
                ${
                  error
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }
              `}
            >
              {error ? (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              )}

              <span>{error || notice}</span>
            </div>
          )}

          {/* MAIN AREA */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* FEEDER TABLE */}
            <section className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-600" />

                      <h2 className="font-semibold text-slate-900">
                        Connecting feeder services
                      </h2>
                    </div>

                    <p className="text-xs text-slate-500 mt-1">
                      Select a connection to review or update its departure time.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />

                    Auto refresh every 10 seconds
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Service
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Train
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Scheduled
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Adjusted
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {loading && !services.length ? (
                      <tr>
                        <td
                          colSpan="5"
                          className="px-4 py-12 text-center"
                        >
                          <div className="flex flex-col items-center">
                            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />

                            <p className="text-sm text-slate-500 mt-3">
                              Loading feeder connections...
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : !services.length ? (
                      <tr>
                        <td
                          colSpan="5"
                          className="px-4 py-12 text-center"
                        >
                          <Bus className="w-8 h-8 text-slate-300 mx-auto" />

                          <p className="text-sm font-medium text-slate-600 mt-3">
                            No feeder connections
                          </p>

                          <p className="text-xs text-slate-400 mt-1">
                            No connecting services are currently configured.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      services.map((s) => {
                        const active =
                          selected?.id === s.id;

                        const changed =
                          s.syncStatus ===
                          "RESCHEDULED";

                        return (
                          <tr
                            key={s.id}
                            onClick={() =>
                              setSelected(s)
                            }
                            className={`
                              cursor-pointer
                              transition
                              ${
                                active
                                  ? "bg-amber-50"
                                  : "hover:bg-slate-50"
                              }
                            `}
                          >
                            {/* SERVICE */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`
                                    w-8 h-8 rounded-md
                                    flex items-center justify-center
                                    ${
                                      active
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-slate-100 text-slate-500"
                                    }
                                  `}
                                >
                                  <Bus className="w-4 h-4" />
                                </div>

                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {s.connectingService}
                                  </p>

                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {s.stationCode}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* TRAIN */}
                            <td className="px-4 py-3.5">
                              <p className="text-sm font-medium text-slate-800">
                                #{s.trainNumber}
                              </p>

                              <p className="text-xs text-slate-500 mt-0.5">
                                {s.trainName}
                              </p>
                            </td>

                            {/* SCHEDULED */}
                            <td className="px-4 py-3.5">
                              <span className="text-sm font-medium text-slate-700">
                                {s.scheduledDeparture}
                              </span>
                            </td>

                            {/* ADJUSTED */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`
                                  text-sm font-semibold
                                  ${
                                    changed
                                      ? "text-amber-700"
                                      : "text-slate-700"
                                  }
                                `}
                              >
                                {s.adjustedDeparture}
                              </span>
                            </td>

                            {/* STATUS */}
                            <td className="px-4 py-3.5">
                              <span
                                className={`
                                  inline-flex px-2 py-1
                                  rounded-full
                                  text-xs font-medium
                                  ${
                                    changed
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-emerald-50 text-emerald-700"
                                  }
                                `}
                              >
                                {s.syncStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* DETAILS PANEL */}
            <aside className="xl:col-span-4">
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden h-full">
                <div className="px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-amber-600" />

                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Feeder dispatch
                      </h3>

                      <p className="text-xs text-slate-500 mt-0.5">
                        Review the selected connection before dispatching an update.
                      </p>
                    </div>
                  </div>
                </div>

                {selected ? (
                  <div className="p-4">
                    {/* SELECTED SERVICE */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-500">
                            Connecting service
                          </p>

                          <h3 className="text-base font-bold text-slate-900 mt-1">
                            {selected.connectingService}
                          </h3>

                          <p className="text-xs text-slate-500 mt-1">
                            Station: {selected.stationCode}
                          </p>
                        </div>

                        <span
                          className={`
                            shrink-0
                            px-2 py-1
                            rounded-full
                            text-xs font-medium
                            ${
                              selected.syncStatus ===
                              "RESCHEDULED"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                            }
                          `}
                        >
                          {selected.syncStatus}
                        </span>
                      </div>
                    </div>

                    {/* TRAIN INFO */}
                    <div className="mt-4">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        Connected train
                      </p>

                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Train className="w-4 h-4 text-slate-600" />
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {selected.trainName}
                          </p>

                          <p className="text-xs text-slate-500 mt-0.5">
                            #{selected.trainNumber}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* TIMING DETAILS */}
                    <div className="mt-4 border border-slate-200 rounded-lg divide-y divide-slate-100">
                      <Row
                        icon={Clock3}
                        label="Predicted delay"
                        value={`+${selected.predictedDelay} min`}
                        tone="red"
                      />

                      <Row
                        icon={Clock3}
                        label="Scheduled departure"
                        value={
                          selected.scheduledDeparture
                        }
                      />

                      <Row
                        icon={Clock3}
                        label="Adjusted departure"
                        value={
                          selected.adjustedDeparture
                        }
                        tone="amber"
                      />

                      <div className="px-3.5 py-3 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">
                          Model source
                        </span>

                        <span className="text-xs font-semibold text-slate-700 text-right">
                          {selected.modelSource}
                        </span>
                      </div>
                    </div>

                    {/* ACTION */}
                    <button
                      onClick={sync}
                      disabled={syncing}
                      className="
                        w-full
                        mt-4
                        inline-flex
                        items-center
                        justify-center
                        gap-2
                        px-4
                        py-2.5
                        rounded-lg
                        bg-amber-600
                        hover:bg-amber-700
                        disabled:bg-slate-300
                        disabled:text-slate-500
                        text-white
                        text-sm
                        font-semibold
                        transition
                      "
                    >
                      <RefreshCw
                        className={
                          syncing
                            ? "w-4 h-4 animate-spin"
                            : "w-4 h-4"
                        }
                      />

                      {syncing
                        ? "Recalculating..."
                        : "Recalculate & Dispatch"}
                    </button>

                    <div className="flex items-start gap-2 mt-3">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />

                      <p className="text-xs text-slate-500 leading-5">
                        Dispatch is authenticated by the backend role.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
                      <Bus className="w-6 h-6 text-slate-400" />
                    </div>

                    <p className="text-sm font-semibold text-slate-600 mt-4">
                      No connection selected
                    </p>

                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Select a feeder connection from the table to view its dispatch details.
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
}) {
  const tones = {
    default: "text-slate-700 bg-slate-100",
    amber: "text-amber-700 bg-amber-50",
    green: "text-emerald-700 bg-emerald-50",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div
          className={`
            w-9 h-9
            rounded-lg
            flex items-center justify-center
            ${tones[tone]}
          `}
        >
          <Icon className="w-4 h-4" />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">
            {label}
          </p>

          <p className="text-xl font-bold text-slate-900 mt-0.5">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  tone = "default",
}) {
  const textClasses = {
    default: "text-slate-700",
    red: "text-red-700",
    amber: "text-amber-700",
  };

  return (
    <div className="px-3.5 py-3 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        {label}
      </span>

      <span
        className={`text-sm font-semibold ${textClasses[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}

