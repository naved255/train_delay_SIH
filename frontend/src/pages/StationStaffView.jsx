import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Train,
  Users,
  Layers,
  Send,
  RefreshCw,
  Clock3,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  getStationArrivals,
  assignPlatform,
  sendAnnouncement,
} from "../api";

const PLATFORMS = [
  "Platform 1",
  "Platform 2",
  "Platform 3",
  "Platform 4",
  "Platform 5",
  "Platform 7",
  "Platform 16",
];

export default function StationStaffView({ user }) {
  const stationCode =
    user?.roleDetail?.split("-")[0]?.toUpperCase() || "NDLS";

  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [platform, setPlatform] = useState("Platform 1");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const load = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);

    try {
      setError("");

      const d = await getStationArrivals(stationCode);
      setData(d);

      setSelected((previous) => {
        const arrivals = d?.arrivals || [];

        return (
          arrivals.find(
            (x) =>
              x.trainNumber === previous?.trainNumber
          ) ||
          arrivals[0] ||
          null
        );
      });
    } catch (e) {
      setError(
        e.response?.data?.message ||
          "Station feed is temporarily unavailable. The dashboard will retry automatically."
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
  }, [stationCode]);

  useEffect(() => {
    if (
      selected?.platformAssigned &&
      selected.platformAssigned !== "Unassigned"
    ) {
      setPlatform(selected.platformAssigned);
    }
  }, [
    selected?.trainNumber,
    selected?.platformAssigned,
  ]);

  const updatePlatform = async () => {
    if (!selected) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await assignPlatform({
        stationCode,
        trainNumber: selected.trainNumber,
        platform,
      });

      setNotice(
        `${selected.trainName} is assigned to ${platform}.`
      );

      await load(false);
    } catch (e) {
      setError(
        e.response?.data?.message ||
          "Platform update failed."
      );
    } finally {
      setSaving(false);
    }
  };

  const broadcast = async (e) => {
    e.preventDefault();

    if (!message.trim()) return;

    setBroadcasting(true);
    setError("");
    setNotice("");

    try {
      await sendAnnouncement({
        stationCode,
        message,
      });

      setMessage("");

      setNotice(
        "Announcement dispatched to the station operations feed."
      );

      await load(false);
    } catch (e) {
      setError(
        e.response?.data?.message ||
          "Announcement failed."
      );
    } finally {
      setBroadcasting(false);
    }
  };

  const arrivals = data?.arrivals || [];

  const delayed = arrivals.filter(
    (t) => Number(t.predictedDelay) > 10
  ).length;

  const unassigned = arrivals.filter(
    (t) =>
      !t.platformAssigned ||
      t.platformAssigned === "Unassigned"
  ).length;

  const selectedStatus = useMemo(() => {
    if (!selected) return null;

    return Number(selected.predictedDelay) > 20
      ? "Delayed"
      : "Expected";
  }, [selected]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-[1600px] mx-auto">
        {/* HEADER */}
        <header className="bg-white border-b border-slate-200">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-700 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                      Station Operations
                    </h1>

                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
                      {stationCode}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    {data?.station?.name || "Station"}{" "}
                    · Arrivals, platforms and announcements
                  </p>
                </div>
              </div>

              <button
                onClick={() => load(true)}
                disabled={loading}
                className="
                  inline-flex items-center justify-center gap-2
                  px-3 py-2
                  bg-white border border-slate-300
                  rounded-lg
                  text-sm font-medium text-slate-700
                  hover:bg-slate-50
                  transition
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                "
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    loading ? "animate-spin" : ""
                  }`}
                />

                Refresh
              </button>
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

          {/* SUMMARY */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              icon={Train}
              label="Inbound"
              value={arrivals.length}
            />

            <Stat
              icon={AlertTriangle}
              label="Delayed"
              value={delayed}
              tone="amber"
            />

            <Stat
              icon={Layers}
              label="Unassigned"
              value={unassigned}
              tone="blue"
            />

            <Stat
              icon={Users}
              label="Announcements"
              value={
                data?.recentAnnouncements?.length || 0
              }
              tone="green"
            />
          </section>

          {/* MAIN CONTENT */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* ARRIVALS TABLE */}
            <section className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Train className="w-4 h-4 text-red-700" />

                      <h2 className="font-semibold text-slate-900">
                        Inbound arrivals
                      </h2>
                    </div>

                    <p className="text-xs text-slate-500 mt-1">
                      Select a train to manage its platform assignment.
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
                        Train
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        ETA delay
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Expected range
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Platform
                      </th>

                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {loading && !arrivals.length ? (
                      <tr>
                        <td
                          colSpan="5"
                          className="px-4 py-12 text-center"
                        >
                          <div className="flex flex-col items-center">
                            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />

                            <p className="text-sm text-slate-500 mt-3">
                              Loading station feed...
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : !arrivals.length ? (
                      <tr>
                        <td
                          colSpan="5"
                          className="px-4 py-12 text-center"
                        >
                          <Train className="w-8 h-8 text-slate-300 mx-auto" />

                          <p className="text-sm font-medium text-slate-600 mt-3">
                            No approaching trains
                          </p>

                          <p className="text-xs text-slate-400 mt-1">
                            There are currently no inbound trains for this station.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      arrivals.map((t) => {
                        const active =
                          selected?.trainNumber ===
                          t.trainNumber;

                        const isDelayed =
                          Number(t.predictedDelay) > 10;

                        return (
                          <tr
                            key={t.trainNumber}
                            onClick={() =>
                              setSelected(t)
                            }
                            className={`
                              cursor-pointer
                              transition
                              ${
                                active
                                  ? "bg-red-50"
                                  : "hover:bg-slate-50"
                              }
                            `}
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`
                                    w-8 h-8 rounded-md
                                    flex items-center justify-center
                                    ${
                                      active
                                        ? "bg-red-100 text-red-700"
                                        : "bg-slate-100 text-slate-500"
                                    }
                                  `}
                                >
                                  <Train className="w-4 h-4" />
                                </div>

                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {t.trainName}
                                  </p>

                                  <p className="text-xs text-slate-500 mt-0.5">
                                    #{t.trainNumber}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className={`
                                  text-sm font-semibold
                                  ${
                                    isDelayed
                                      ? "text-amber-700"
                                      : "text-emerald-700"
                                  }
                                `}
                              >
                                +{t.predictedDelay} min
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-sm text-slate-500">
                              {t.predictedRange
                                ? `${t.predictedRange[0]}–${t.predictedRange[1]} min`
                                : "—"}
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className={`
                                  inline-flex px-2 py-1
                                  rounded-md
                                  text-xs font-medium
                                  ${
                                    t.platformAssigned &&
                                    t.platformAssigned !==
                                      "Unassigned"
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-slate-100 text-slate-500"
                                  }
                                `}
                              >
                                {t.platformAssigned ||
                                  "Unassigned"}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className={`
                                  inline-flex px-2 py-1
                                  rounded-full
                                  text-xs font-medium
                                  ${
                                    isDelayed
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-emerald-50 text-emerald-700"
                                  }
                                `}
                              >
                                {t.status}
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

            {/* RIGHT SIDEBAR */}
            <aside className="xl:col-span-4 space-y-5">
              {/* PLATFORM ASSIGNMENT */}
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-red-700" />

                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Platform assignment
                      </h3>

                      <p className="text-xs text-slate-500 mt-0.5">
                        Assign a platform to the selected train.
                      </p>
                    </div>
                  </div>
                </div>

                {selected ? (
                  <div className="p-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {selected.trainName}
                          </p>

                          <p className="text-xs text-slate-500 mt-1">
                            #{selected.trainNumber}
                          </p>
                        </div>

                        <span
                          className={`
                            px-2 py-1 rounded-full
                            text-xs font-medium
                            ${
                              selectedStatus ===
                              "Delayed"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                            }
                          `}
                        >
                          {selectedStatus}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200">
                        <Clock3 className="w-4 h-4 text-slate-400" />

                        <span className="text-xs text-slate-500">
                          Predicted delay
                        </span>

                        <span className="text-sm font-semibold text-amber-700 ml-auto">
                          +{selected.predictedDelay} min
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Assign platform
                      </label>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={platform}
                          onChange={(e) =>
                            setPlatform(e.target.value)
                          }
                          className="
                            flex-1
                            bg-white
                            border border-slate-300
                            rounded-lg
                            px-3 py-2.5
                            text-sm text-slate-800
                            focus:outline-none
                            focus:ring-2
                            focus:ring-red-500/20
                            focus:border-red-500
                          "
                        >
                          {PLATFORMS.map((p) => (
                            <option key={p}>
                              {p}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={updatePlatform}
                          disabled={saving}
                          className="
                            px-4 py-2.5
                            rounded-lg
                            bg-red-700
                            hover:bg-red-800
                            disabled:bg-slate-300
                            disabled:text-slate-500
                            text-white
                            text-sm font-semibold
                            transition
                          "
                        >
                          {saving
                            ? "Saving..."
                            : "Confirm"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <Train className="w-8 h-8 text-slate-300 mx-auto" />

                    <p className="text-sm font-medium text-slate-600 mt-3">
                      No train selected
                    </p>

                    <p className="text-xs text-slate-400 mt-1">
                      Select an approaching train from the table to assign a platform.
                    </p>
                  </div>
                )}
              </section>

              {/* ANNOUNCEMENT */}
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-red-700" />

                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Station announcement
                      </h3>

                      <p className="text-xs text-slate-500 mt-0.5">
                        Send an update to the station operations feed.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <form
                    onSubmit={broadcast}
                    className="space-y-3"
                  >
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Message
                      </label>

                      <textarea
                        rows="4"
                        maxLength={240}
                        value={message}
                        onChange={(e) =>
                          setMessage(e.target.value)
                        }
                        placeholder="Example: 12951 expected at Platform 1 with a 10-minute delay."
                        className="
                          w-full
                          resize-none
                          bg-white
                          border border-slate-300
                          rounded-lg
                          px-3 py-2.5
                          text-sm
                          text-slate-800
                          placeholder:text-slate-400
                          focus:outline-none
                          focus:ring-2
                          focus:ring-red-500/20
                          focus:border-red-500
                        "
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {message.length}/240
                      </span>

                      <button
                        type="submit"
                        disabled={
                          !message.trim() ||
                          broadcasting
                        }
                        className="
                          inline-flex items-center gap-2
                          px-4 py-2.5
                          rounded-lg
                          bg-slate-800
                          hover:bg-slate-900
                          disabled:bg-slate-200
                          disabled:text-slate-400
                          text-white
                          text-sm font-semibold
                          transition
                        "
                      >
                        <Send className="w-4 h-4" />

                        {broadcasting
                          ? "Dispatching..."
                          : "Dispatch"}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            </aside>
          </div>

          {/* RECENT ANNOUNCEMENTS */}
          {data?.recentAnnouncements?.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-600" />

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Recent announcements
                    </h2>

                    <p className="text-xs text-slate-500 mt-0.5">
                      Latest messages sent to the station operations feed.
                    </p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {data.recentAnnouncements.map(
                  (announcement, index) => (
                    <div
                      key={
                        announcement.id ||
                        announcement._id ||
                        index
                      }
                      className="px-4 sm:px-5 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <Send className="w-3.5 h-3.5 text-slate-500" />
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm text-slate-700">
                            {announcement.message ||
                              announcement.text ||
                              announcement}
                          </p>

                          {announcement.createdAt && (
                            <p className="text-xs text-slate-400 mt-1">
                              {new Date(
                                announcement.createdAt
                              ).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>
          )}
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
    default:
      "text-slate-700 bg-slate-100",
    amber:
      "text-amber-700 bg-amber-50",
    blue:
      "text-blue-700 bg-blue-50",
    green:
      "text-emerald-700 bg-emerald-50",
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

