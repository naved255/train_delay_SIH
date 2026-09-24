import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  SlidersHorizontal,
  Cpu,
  Play,
  RefreshCw,
  AlertTriangle,
  TrainFront,
  ArrowDown,
  ArrowRight,
  Clock3,
  Zap,
  Network,
  CircleAlert,
  CheckCircle2,
  MapPin,
  X,
} from "lucide-react";

import MapView from "../components/MapView";
import {
  getRunningTrains,
  getCascade,
  injectDelay,
} from "../api";

export default function ControlRoomView() {
  const [trains, setTrains] = useState([]);
  const [selected, setSelected] = useState(null);

  const [delay, setDelay] = useState(20);
  const [reason, setReason] = useState(
    "Temporary Speed Restriction"
  );

  const [cascade, setCascade] = useState(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [cascadeStep, setCascadeStep] = useState(-1);
  const [cascadeView, setCascadeView] = useState("network");
  const [activeAffectedTrain, setActiveAffectedTrain] =
    useState(null);

  /* ---------------------------------------------------------
     LOAD RUNNING TRAINS
  --------------------------------------------------------- */

  const load = async () => {
    try {
      setLoading(true);
      setNotice("");

      const response = await getRunningTrains({
        limit: 100,
        skip: 0,
      });

      console.log(
        "[ControlRoom] Running trains response:",
        response
      );

      let trainData = [];

      if (Array.isArray(response)) {
        trainData = response;
      } else if (Array.isArray(response?.data)) {
        trainData = response.data;
      }

      setTrains(trainData);

      setSelected((previousSelected) => {
        if (!trainData.length) {
          return null;
        }

        if (previousSelected?.id) {
          const existingTrain = trainData.find(
            (train) =>
              String(train.id) ===
              String(previousSelected.id)
          );

          if (existingTrain) {
            return existingTrain;
          }
        }

        return trainData[0];
      });

      if (!trainData.length) {
        setNotice("No running train data available.");
      }
    } catch (error) {
      console.error(
        "[ControlRoom] Failed to load running trains:",
        error
      );

      setTrains([]);
      setSelected(null);

      setNotice(
        error?.response?.data?.message ||
          error?.message ||
          "Could not fetch train data from backend."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------------------------------------
     INITIAL LOAD
  --------------------------------------------------------- */

  useEffect(() => {
    load();
  }, []);

  /* ---------------------------------------------------------
     CASCADE ANALYSIS
  --------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const loadCascade = async () => {
      if (!selected?.trainNumber) {
        setCascade(null);
        return;
      }

      try {
        const response = await getCascade(
          selected.trainNumber
        );

        console.log(
          "[ControlRoom] Cascade response:",
          response
        );

        if (!cancelled) {
          setCascade(response || null);
        }
      } catch (error) {
        console.error(
          "[ControlRoom] Cascade request failed:",
          error
        );

        if (!cancelled) {
          setCascade(null);
        }
      }
    };

    loadCascade();

    return () => {
      cancelled = true;
    };
  }, [selected?.trainNumber]);

  /* ---------------------------------------------------------
     CASCADE ANIMATION
  --------------------------------------------------------- */

  useEffect(() => {
    const affected = Array.isArray(
      cascade?.atRiskTrains
    )
      ? cascade.atRiskTrains
      : [];

    if (!cascade || affected.length === 0) {
      setCascadeStep(-1);
      setActiveAffectedTrain(null);
      return;
    }

    setCascadeStep(-1);
    setActiveAffectedTrain(null);

    let currentStep = -1;

    const timer = setInterval(() => {
      currentStep += 1;

      if (currentStep >= affected.length) {
        clearInterval(timer);
        return;
      }

      setCascadeStep(currentStep);
    }, 700);

    return () => clearInterval(timer);
  }, [cascade]);

  /* ---------------------------------------------------------
     DELAY INJECTION
  --------------------------------------------------------- */

  const simulate = async (event) => {
    event.preventDefault();

    if (!selected?.trainNumber) {
      setNotice("Please select a train first.");
      return;
    }

    try {
      setNotice("");

      await injectDelay({
        trainNumber: selected.trainNumber,
        delayMinutes: Number(delay),
        reason,
      });

      setNotice(
        "Delay injected into backend live telemetry."
      );

      await load();

      try {
        const cascadeResponse = await getCascade(
          selected.trainNumber
        );

        setCascade(cascadeResponse || null);
      } catch (cascadeError) {
        console.error(
          "[ControlRoom] Failed to refresh cascade:",
          cascadeError
        );

        setCascade(null);
      }
    } catch (error) {
      console.error(
        "[ControlRoom] Delay injection failed:",
        error
      );

      setNotice(
        error?.response?.data?.message ||
          error?.message ||
          "Delay injection failed."
      );
    }
  };

  /* ---------------------------------------------------------
     SELECT TRAIN
  --------------------------------------------------------- */

  const handleTrainSelection = (event) => {
    const selectedId = event.target.value;

    const train = trains.find(
      (item) =>
        String(item.id) === String(selectedId)
    );

    setSelected(train || null);
  };

  /* ---------------------------------------------------------
     SAFE CASCADE DATA
  --------------------------------------------------------- */

  const atRiskTrains = Array.isArray(
    cascade?.atRiskTrains
  )
    ? cascade.atRiskTrains
    : [];

  /* ---------------------------------------------------------
     CASCADE HELPERS
  --------------------------------------------------------- */

  const visibleAffectedTrains = useMemo(() => {
    if (cascadeStep < 0) {
      return [];
    }

    return atRiskTrains.slice(
      0,
      cascadeStep + 1
    );
  }, [atRiskTrains, cascadeStep]);

  const totalPropagatedDelay = useMemo(() => {
    return atRiskTrains.reduce(
      (sum, train) =>
        sum +
        Number(
          train?.propagatedDelayEstimate ?? 0
        ),
      0
    );
  }, [atRiskTrains]);

  const getImpactLevel = (train, index) => {
    const backendLevel =
      train?.cascadeLevel ??
      train?.level ??
      train?.impactLevel;

    if (
      backendLevel !== undefined &&
      backendLevel !== null
    ) {
      return String(backendLevel);
    }

    if (index === 0) {
      return "Direct";
    }

    if (index === 1) {
      return "Secondary";
    }

    return "Potential";
  };

  const getImpactIcon = (level) => {
    const normalized = String(level).toLowerCase();

    if (normalized.includes("direct")) {
      return (
        <Zap className="w-4 h-4 text-red-600" />
      );
    }

    if (normalized.includes("secondary")) {
      return (
        <Network className="w-4 h-4 text-amber-600" />
      );
    }

    return (
      <CircleAlert className="w-4 h-4 text-blue-600" />
    );
  };

  const handleAffectedTrainClick = (train) => {
    setActiveAffectedTrain(train);
  };

  /* ---------------------------------------------------------
     UI
  --------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-[1600px] mx-auto">

        {/* =====================================================
            TOP HEADER
        ====================================================== */}

        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-700 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>

              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Railway Control Room
                </h1>

                <p className="text-sm text-slate-500">
                  Monitor trains and manage service disruptions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                System active
              </div>

              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2
                bg-white border border-slate-300 rounded-lg
                text-sm font-medium text-slate-700
                hover:bg-slate-50 transition
                disabled:opacity-50"
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

        <main className="p-4 sm:p-6 space-y-5">

          {/* ===================================================
              NOTICE
          ==================================================== */}

          {notice && (
            <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />

              <p className="text-sm text-slate-700">
                {notice}
              </p>
            </div>
          )}

          {/* ===================================================
              QUICK SUMMARY
          ==================================================== */}

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">

            <SummaryCard
              label="Loaded trains"
              value={trains.length}
              icon={
                <TrainFront className="w-4 h-4" />
              }
            />

            <SummaryCard
              label="Delayed trains"
              value={
                trains.filter(
                  (t) =>
                    Number(t.currentDelay) > 10
                ).length
              }
              icon={
                <Clock3 className="w-4 h-4" />
              }
              tone="amber"
            />

            <SummaryCard
              label="Heavy delays"
              value={
                trains.filter(
                  (t) =>
                    Number(t.currentDelay) > 30
                ).length
              }
              icon={
                <AlertTriangle className="w-4 h-4" />
              }
              tone="red"
            />

            <SummaryCard
              label="Affected services"
              value={atRiskTrains.length}
              icon={
                <Network className="w-4 h-4" />
              }
              tone="blue"
            />

          </section>

          {/* ===================================================
              MAIN WORK AREA
          ==================================================== */}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

            {/* =================================================
                MAP
            ================================================== */}

            <section className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">

              <div className="px-4 py-3 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Live Train Map
                    </h2>

                    <p className="text-xs text-slate-500 mt-0.5">
                      Current position of running trains
                    </p>
                  </div>

                  {selected && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">
                        Selected:
                      </span>

                      <span className="font-semibold text-slate-800">
                        {selected.trainNumber}
                      </span>
                    </div>
                  )}

                </div>
              </div>

              <div className="p-3">
                {trains.length > 0 ? (
                  <MapView
                    trains={trains}
                    selectedTrainId={selected?.id}
                    onSelectTrain={setSelected}
                  />
                ) : (
                  <div className="h-[420px] flex flex-col items-center justify-center text-center">
                    <TrainFront className="w-10 h-10 text-slate-300" />

                    <p className="mt-3 text-sm font-medium text-slate-600">
                      {loading
                        ? "Loading train information..."
                        : "No train data available"}
                    </p>
                  </div>
                )}
              </div>

            </section>

            {/* =================================================
                CONTROL PANEL
            ================================================== */}

            <aside className="xl:col-span-4 space-y-5">

              {/* DELAY CONTROL */}

              <section className="bg-white border border-slate-200 rounded-xl">

                <div className="px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">

                    <SlidersHorizontal className="w-4 h-4 text-red-700" />

                    <div>
                      <h2 className="font-semibold text-slate-900">
                        Delay Control
                      </h2>

                      <p className="text-xs text-slate-500">
                        Apply a delay to a running train
                      </p>
                    </div>

                  </div>
                </div>

                <div className="p-4">

                  <form
                    onSubmit={simulate}
                    className="space-y-4"
                  >

                    {/* TRAIN */}

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Train
                      </label>

                      <select
                        value={selected?.id || ""}
                        onChange={handleTrainSelection}
                        disabled={trains.length === 0}
                        className="w-full bg-white border border-slate-300
                        rounded-lg px-3 py-2.5 text-sm
                        text-slate-800
                        focus:outline-none focus:ring-2
                        focus:ring-red-500/20 focus:border-red-500
                        disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">
                          {trains.length === 0
                            ? "No trains available"
                            : "Select a train"}
                        </option>

                        {trains.map((train) => (
                          <option
                            key={train.id}
                            value={train.id}
                          >
                            {train.trainNumber} -{" "}
                            {train.trainName ||
                              "Unknown Train"}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* DELAY */}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Delay (minutes)
                        </label>

                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={delay}
                          onChange={(event) =>
                            setDelay(event.target.value)
                          }
                          className="w-full bg-white border border-slate-300
                          rounded-lg px-3 py-2.5 text-sm
                          focus:outline-none focus:ring-2
                          focus:ring-red-500/20 focus:border-red-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Reason
                        </label>

                        <select
                          value={reason}
                          onChange={(event) =>
                            setReason(event.target.value)
                          }
                          className="w-full bg-white border border-slate-300
                          rounded-lg px-3 py-2.5 text-sm
                          focus:outline-none focus:ring-2
                          focus:ring-red-500/20 focus:border-red-500"
                        >
                          <option>
                            Temporary Speed Restriction
                          </option>

                          <option>
                            Signal Aspect Failure
                          </option>

                          <option>
                            Unscheduled Maintenance
                          </option>

                          <option>
                            Level Crossing Gate Open
                          </option>
                        </select>
                      </div>

                    </div>

                    <button
                      type="submit"
                      disabled={!selected || loading}
                      className="w-full flex items-center justify-center
                      gap-2 bg-red-700 hover:bg-red-800
                      disabled:bg-slate-300 disabled:text-slate-500
                      text-white rounded-lg px-4 py-2.5
                      text-sm font-semibold transition"
                    >
                      <Play className="w-4 h-4" />

                      Apply Delay
                    </button>

                  </form>
                </div>
              </section>

              {/* SELECTED TRAIN */}

              {selected && (
                <section className="bg-white border border-slate-200 rounded-xl">

                  <div className="px-4 py-3 border-b border-slate-200">
                    <div className="flex items-center justify-between">

                      <div>
                        <p className="text-xs text-slate-500">
                          Selected train
                        </p>

                        <h2 className="font-semibold text-slate-900 mt-0.5">
                          {selected.trainNumber}
                        </h2>
                      </div>

                      <div
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          Number(selected.currentDelay) > 10
                            ? "bg-red-50 text-red-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {Number(selected.currentDelay) > 10
                          ? "Delayed"
                          : "On time"}
                      </div>

                    </div>
                  </div>

                  <div className="p-4 space-y-4">

                    <div>
                      <p className="font-semibold text-slate-900">
                        {selected.trainName ||
                          "Unknown Train"}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {selected.currentStation ||
                          "Current station unavailable"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">

                      <InfoBox
                        label="Current delay"
                        value={`+${
                          selected.currentDelay ?? 0
                        } min`}
                        tone={
                          Number(selected.currentDelay) > 10
                            ? "red"
                            : "green"
                        }
                      />

                      <InfoBox
                        label="ML confidence"
                        value={
                          selected.mlConfidence != null
                            ? `${selected.mlConfidence}%`
                            : "N/A"
                        }
                        tone="green"
                      />

                    </div>

                    {selected.topReason && (
                      <div className="flex gap-2 pt-3 border-t border-slate-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />

                        <p className="text-xs leading-5 text-slate-600">
                          {selected.topReason}
                        </p>
                      </div>
                    )}

                  </div>
                </section>
              )}

            </aside>
          </div>

          {/* ===================================================
              CASCADE IMPACT
          ==================================================== */}

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">

            {/* HEADER */}

            <div className="px-4 sm:px-5 py-4 border-b border-slate-200">

              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                <div className="flex items-center gap-3">

                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Network className="w-5 h-5 text-slate-700" />
                  </div>

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Cascade Impact
                    </h2>

                    <p className="text-xs text-slate-500 mt-0.5">
                      Downstream effect of the selected train disruption
                    </p>
                  </div>

                </div>

                {/* VIEW SWITCHER */}

                <div className="flex border border-slate-200 rounded-lg p-1 bg-slate-50">

                  {[
                    ["network", "Network"],
                    ["timeline", "Timeline"],
                    ["services", "Services"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() =>
                        setCascadeView(value)
                      }
                      className={`px-3 py-1.5 rounded-md
                      text-xs font-medium transition ${
                        cascadeView === value
                          ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}

                </div>

              </div>
            </div>

            {/* SUMMARY */}

            {cascade && (
              <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-slate-200">

                <CascadeMetric
                  label="Primary train"
                  value={
                    selected?.trainNumber || "N/A"
                  }
                  icon={
                    <TrainFront className="w-4 h-4" />
                  }
                />

                <CascadeMetric
                  label="Affected services"
                  value={atRiskTrains.length}
                  icon={
                    <CircleAlert className="w-4 h-4" />
                  }
                  tone="amber"
                />

                <CascadeMetric
                  label="Predicted delay"
                  value={`${
                    cascade.predictedDelayP50 ?? "N/A"
                  } min`}
                  icon={
                    <Clock3 className="w-4 h-4" />
                  }
                  tone="blue"
                />

                <CascadeMetric
                  label="Propagated delay"
                  value={`${totalPropagatedDelay} min`}
                  icon={
                    <Zap className="w-4 h-4" />
                  }
                  tone="red"
                />

              </div>
            )}

            {/* CONTENT */}

            {!cascade ? (
              <EmptyState
                icon={
                  <Network className="w-7 h-7" />
                }
                title="No cascade analysis"
                text={
                  selected
                    ? "Waiting for the impact analysis for the selected train."
                    : "Select a train to view downstream impact."
                }
              />
            ) : atRiskTrains.length === 0 ? (
              <EmptyState
                icon={
                  <CheckCircle2 className="w-7 h-7" />
                }
                title="No downstream impact detected"
                text="No overlapping active section was found for the selected train."
                success
              />
            ) : (
              <div className="p-4 sm:p-5">

                {/* =============================================
                    NETWORK VIEW
                ============================================== */}

                {cascadeView === "network" && (
                  <div className="space-y-5">

                    {/* PRIMARY TRAIN */}

                    <div className="flex justify-center">

                      <div className="w-full max-w-sm border border-red-200 bg-red-50 rounded-xl p-4">

                        <div className="flex items-center gap-3">

                          <div className="w-10 h-10 rounded-lg bg-white border border-red-200 flex items-center justify-center">
                            <TrainFront className="w-5 h-5 text-red-700" />
                          </div>

                          <div>
                            <p className="text-xs font-medium text-red-700">
                              Primary disruption
                            </p>

                            <p className="font-bold text-slate-900 mt-0.5">
                              {selected?.trainNumber ||
                                "Selected Train"}
                            </p>

                            <p className="text-xs text-slate-500">
                              {selected?.trainName ||
                                "Unknown Train"}
                            </p>
                          </div>

                          <div className="ml-auto text-right">
                            <p className="text-xs text-slate-500">
                              Delay
                            </p>

                            <p className="font-bold text-red-700">
                              +{selected?.currentDelay ?? 0} min
                            </p>
                          </div>

                        </div>

                      </div>
                    </div>

                    {/* CONNECTION */}

                    <div className="flex flex-col items-center">

                      <div className="h-8 border-l border-slate-300" />

                      <ArrowDown className="w-4 h-4 text-slate-400" />

                      <span className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">
                        downstream impact
                      </span>

                    </div>

                    {/* AFFECTED TRAINS */}

                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">

                      {atRiskTrains.map(
                        (train, index) => {

                          const isVisible =
                            index <= cascadeStep;

                          const level =
                            getImpactLevel(
                              train,
                              index
                            );

                          const isActive =
                            activeAffectedTrain
                              ?.trainNumber ===
                            train.trainNumber;

                          return (
                            <button
                              key={
                                train.trainNumber ||
                                index
                              }
                              onClick={() =>
                                handleAffectedTrainClick(
                                  train
                                )
                              }
                              className={`text-left transition-all duration-500 ${
                                isVisible
                                  ? "opacity-100 translate-y-0"
                                  : "opacity-0 translate-y-3 pointer-events-none"
                              }`}
                            >
                              <div
                                className={`h-full border rounded-xl p-4
                                ${
                                  isActive
                                    ? "border-blue-500 ring-2 ring-blue-100"
                                    : "border-slate-200"
                                }
                                hover:border-slate-300
                                hover:bg-slate-50
                                transition`}
                              >

                                <div className="flex items-start justify-between gap-3">

                                  <div className="flex items-center gap-3">

                                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                                      <TrainFront className="w-4 h-4 text-slate-600" />
                                    </div>

                                    <div>
                                      <p className="font-semibold text-sm text-slate-900">
                                        {train.trainNumber ||
                                          "Unknown"}
                                      </p>

                                      <p className="text-xs text-slate-500 mt-0.5">
                                        {train.trainName ||
                                          "Unknown Train"}
                                      </p>
                                    </div>

                                  </div>

                                  <span className="text-[10px] font-medium text-slate-500">
                                    {level}
                                  </span>

                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">

                                  <div>
                                    <p className="text-[10px] text-slate-400 uppercase">
                                      Current
                                    </p>

                                    <p className="text-sm font-semibold text-red-700 mt-0.5">
                                      +{train.currentDelay ?? 0} min
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-[10px] text-slate-400 uppercase">
                                      Estimated
                                    </p>

                                    <p className="text-sm font-semibold text-amber-700 mt-0.5">
                                      +{train.propagatedDelayEstimate ?? 0} min
                                    </p>
                                  </div>

                                </div>

                              </div>
                            </button>
                          );
                        }
                      )}

                    </div>

                    {/* DETAIL */}

                    {activeAffectedTrain && (
                      <div className="border border-blue-200 bg-blue-50 rounded-xl p-4">

                        <div className="flex items-start justify-between gap-4">

                          <div>
                            <p className="text-xs font-medium text-blue-700">
                              Affected service
                            </p>

                            <h3 className="font-bold text-slate-900 mt-1">
                              {activeAffectedTrain.trainNumber}
                            </h3>

                            <p className="text-xs text-slate-500 mt-0.5">
                              {activeAffectedTrain.trainName ||
                                "Unknown Train"}
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              setActiveAffectedTrain(
                                null
                              )
                            }
                            className="p-1.5 rounded-md
                            text-slate-400 hover:text-slate-700
                            hover:bg-white transition"
                            title="Close"
                          >
                            <X className="w-4 h-4" />
                          </button>

                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">

                          <DetailItem
                            label="Current delay"
                            value={`+${
                              activeAffectedTrain.currentDelay ??
                              0
                            } min`}
                          />

                          <DetailItem
                            label="Propagated estimate"
                            value={`+${
                              activeAffectedTrain.propagatedDelayEstimate ??
                              0
                            } min`}
                          />

                          <DetailItem
                            label="Impact level"
                            value={getImpactLevel(
                              activeAffectedTrain,
                              atRiskTrains.findIndex(
                                (t) =>
                                  t.trainNumber ===
                                  activeAffectedTrain.trainNumber
                              )
                            )}
                          />

                          <DetailItem
                            label="Section"
                            value={
                              activeAffectedTrain.section ||
                              cascade.section ||
                              "N/A"
                            }
                          />

                        </div>

                      </div>
                    )}

                  </div>
                )}

                {/* =============================================
                    TIMELINE VIEW
                ============================================== */}

                {cascadeView === "timeline" && (
                  <div className="max-w-3xl mx-auto">

                    <div className="relative">

                      <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-200" />

                      <div className="space-y-5">

                        {/* PRIMARY */}

                        <TimelineItem
                          icon={
                            <TrainFront className="w-4 h-4 text-red-700" />
                          }
                          label="Primary disruption"
                          title={
                            selected?.trainNumber ||
                            "Selected Train"
                          }
                          value={`+${
                            selected?.currentDelay ?? 0
                          } min`}
                          description={reason}
                          primary
                        />

                        {/* AFFECTED */}

                        {atRiskTrains.map(
                          (train, index) => {

                            const visible =
                              index <= cascadeStep;

                            const level =
                              getImpactLevel(
                                train,
                                index
                              );

                            return (
                              <div
                                key={
                                  train.trainNumber ||
                                  index
                                }
                                className={`transition-all duration-500 ${
                                  visible
                                    ? "opacity-100 translate-x-0"
                                    : "opacity-0 translate-x-4"
                                }`}
                              >
                                <TimelineItem
                                  icon={getImpactIcon(
                                    level
                                  )}
                                  label={`T+${
                                    index + 1
                                  } • ${level}`}
                                  title={
                                    train.trainNumber
                                  }
                                  value={`+${
                                    train.propagatedDelayEstimate ??
                                    0
                                  } min`}
                                  description={
                                    train.trainName ||
                                    "Affected service"
                                  }
                                />
                              </div>
                            );
                          }
                        )}

                      </div>
                    </div>

                  </div>
                )}

                {/* =============================================
                    SERVICES VIEW
                ============================================== */}

                {cascadeView === "services" && (
                  <div>

                    <div className="mb-4">
                      <h3 className="font-semibold text-slate-900">
                        Affected services
                      </h3>

                      <p className="text-xs text-slate-500 mt-1">
                        Services identified by the cascade analysis.
                      </p>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-lg">

                      <table className="w-full text-left">

                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Train
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Impact
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Current
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Estimated
                            </th>

                            <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                              Section
                            </th>

                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">

                          {atRiskTrains.map(
                            (train, index) => {

                              const level =
                                getImpactLevel(
                                  train,
                                  index
                                );

                              const visible =
                                index <= cascadeStep;

                              return (
                                <tr
                                  key={
                                    train.trainNumber ||
                                    index
                                  }
                                  onClick={() =>
                                    handleAffectedTrainClick(
                                      train
                                    )
                                  }
                                  className={`cursor-pointer hover:bg-slate-50 transition ${
                                    visible
                                      ? "opacity-100"
                                      : "opacity-30"
                                  }`}
                                >

                                  <td className="px-4 py-3">

                                    <p className="text-sm font-semibold text-slate-900">
                                      {train.trainNumber}
                                    </p>

                                    <p className="text-xs text-slate-500">
                                      {train.trainName ||
                                        "Unknown"}
                                    </p>

                                  </td>

                                  <td className="px-4 py-3">

                                    <div className="flex items-center gap-2">

                                      {getImpactIcon(
                                        level
                                      )}

                                      <span className="text-xs text-slate-700">
                                        {level}
                                      </span>

                                    </div>

                                  </td>

                                  <td className="px-4 py-3">
                                    <span className="text-sm font-medium text-red-700">
                                      +{train.currentDelay ?? 0} min
                                    </span>
                                  </td>

                                  <td className="px-4 py-3">
                                    <span className="text-sm font-medium text-amber-700">
                                      +{train.propagatedDelayEstimate ?? 0} min
                                    </span>
                                  </td>

                                  <td className="px-4 py-3">
                                    <span className="text-xs text-slate-500">
                                      {train.section ||
                                        cascade.section ||
                                        "N/A"}
                                    </span>
                                  </td>

                                </tr>
                              );
                            }
                          )}

                        </tbody>
                      </table>

                    </div>

                  </div>
                )}

              </div>
            )}

          </section>

          {/* ===================================================
              ORIGINAL CASCADE INFORMATION
          ==================================================== */}

          <section className="bg-white border border-slate-200 rounded-xl">

            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">

              <AlertTriangle className="w-4 h-4 text-amber-600" />

              <h2 className="font-semibold text-slate-900">
                Downstream Cascade Analysis
              </h2>

            </div>

            <div className="p-4">

              {cascade ? (
                <>

                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">

                    <p>
                      <span className="text-slate-500">
                        Current section:
                      </span>{" "}
                      <span className="font-medium text-slate-900">
                        {cascade.section || "N/A"}
                      </span>
                    </p>

                    <p>
                      <span className="text-slate-500">
                        Predicted delay:
                      </span>{" "}
                      <span className="font-medium text-amber-700">
                        {cascade.predictedDelayP50 ??
                          "N/A"}{" "}
                        min
                      </span>
                    </p>

                  </div>

                  <div className="grid md:grid-cols-3 gap-3 mt-4">

                    {atRiskTrains.map(
                      (train) => (
                        <div
                          key={train.trainNumber}
                          className="border border-slate-200 rounded-lg p-3"
                        >

                          <div className="flex items-center gap-2">

                            <TrainFront className="w-4 h-4 text-slate-500" />

                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {train.trainNumber}
                              </p>

                              <p className="text-xs text-slate-500">
                                {train.trainName ||
                                  "Unknown Train"}
                              </p>
                            </div>

                          </div>

                          <p className="text-xs text-slate-500 mt-3">

                            Current{" "}
                            <span className="font-medium text-red-700">
                              +{train.currentDelay ?? 0} min
                            </span>

                            {" • "}

                            Estimated{" "}
                            <span className="font-medium text-amber-700">
                              +{train.propagatedDelayEstimate ??
                                0} min
                            </span>

                          </p>

                        </div>
                      )
                    )}

                    {atRiskTrains.length === 0 && (
                      <p className="text-sm text-slate-500">
                        No overlapping active section detected.
                      </p>
                    )}

                  </div>

                </>
              ) : (
                <p className="text-sm text-slate-500">
                  {selected
                    ? "Loading cascade analysis..."
                    : "Select a train to view its cascade analysis."}
                </p>
              )}

            </div>

          </section>

        </main>
      </div>
    </div>
  );
}

/* =============================================================
   SUMMARY CARD
============================================================= */

function SummaryCard({
  label,
  value,
  icon,
  tone = "default",
}) {
  const tones = {
    default: "text-slate-700 bg-slate-100",
    amber: "text-amber-700 bg-amber-50",
    red: "text-red-700 bg-red-50",
    blue: "text-blue-700 bg-blue-50",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">

      <div className="flex items-center gap-2">

        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones[tone]}`}
        >
          {icon}
        </div>

        <span className="text-xs font-medium text-slate-500">
          {label}
        </span>

      </div>

      <p className="text-2xl font-bold text-slate-900 mt-3">
        {value}
      </p>

    </div>
  );
}

/* =============================================================
   INFO BOX
============================================================= */

function InfoBox({
  label,
  value,
  tone = "default",
}) {
  const textClasses = {
    default: "text-slate-900",
    red: "text-red-700",
    green: "text-emerald-700",
  };

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">

      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p
        className={`text-lg font-bold mt-1 ${textClasses[tone]}`}
      >
        {value}
      </p>

    </div>
  );
}

/* =============================================================
   CASCADE METRIC
============================================================= */

function CascadeMetric({
  label,
  value,
  icon,
  tone = "default",
}) {
  const tones = {
    default: "text-slate-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    red: "text-red-700",
  };

  return (
    <div className="p-4 border-r border-slate-200 last:border-r-0">

      <div className="flex items-center gap-2">

        <span className={tones[tone]}>
          {icon}
        </span>

        <span className="text-xs text-slate-500">
          {label}
        </span>

      </div>

      <p
        className={`text-lg font-bold mt-2 ${tones[tone]}`}
      >
        {value}
      </p>

    </div>
  );
}

/* =============================================================
   EMPTY STATE
============================================================= */

function EmptyState({
  icon,
  title,
  text,
  success = false,
}) {
  return (
    <div className="py-12 px-5 text-center">

      <div
        className={`w-12 h-12 mx-auto rounded-full
        flex items-center justify-center
        ${
          success
            ? "bg-emerald-50 text-emerald-600"
            : "bg-slate-100 text-slate-400"
        }`}
      >
        {icon}
      </div>

      <h3 className="font-semibold text-slate-800 mt-4">
        {title}
      </h3>

      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        {text}
      </p>

    </div>
  );
}

/* =============================================================
   TIMELINE ITEM
============================================================= */

function TimelineItem({
  icon,
  label,
  title,
  value,
  description,
  primary = false,
}) {
  return (
    <div className="relative flex gap-4">

      <div
        className={`relative z-10 w-8 h-8 rounded-full
        border flex items-center justify-center shrink-0
        ${
          primary
            ? "bg-red-50 border-red-200"
            : "bg-white border-slate-200"
        }`}
      >
        {icon}
      </div>

      <div
        className={`flex-1 border rounded-lg p-4 ${
          primary
            ? "border-red-200 bg-red-50/40"
            : "border-slate-200 bg-white"
        }`}
      >

        <div className="flex items-start justify-between gap-4">

          <div>

            <p
              className={`text-[11px] font-medium uppercase tracking-wide ${
                primary
                  ? "text-red-700"
                  : "text-slate-500"
              }`}
            >
              {label}
            </p>

            <p className="font-semibold text-slate-900 mt-1">
              {title}
            </p>

            <p className="text-xs text-slate-500 mt-1">
              {description}
            </p>

          </div>

          <span
            className={`text-sm font-semibold shrink-0 ${
              primary
                ? "text-red-700"
                : "text-amber-700"
            }`}
          >
            {value}
          </span>

        </div>

      </div>

    </div>
  );
}

/* =============================================================
   DETAIL ITEM
============================================================= */

function DetailItem({
  label,
  value,
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">

      <p className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="text-sm font-semibold text-slate-800 mt-1">
        {value}
      </p>

    </div>
  );
}


