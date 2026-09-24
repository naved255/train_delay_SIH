import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DEFAULT_CENTER = [22.5, 78.9];

const isValidCoordinate = (value) => {
  if (!Array.isArray(value) || value.length < 2) return false;

  const lat = Number(value[0]);
  const lon = Number(value[1]);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
};

const toLatLng = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
    ? [lat, lon]
    : null;
};

/* -------------------------------------------------------
   TRAIN MARKER
------------------------------------------------------- */

const trainIcon = (delayed, selected = false) =>
  L.divIcon({
    className: "",
    html: `
      <div
        style="
          position:relative;
          width:${selected ? "42px" : "36px"};
          height:${selected ? "42px" : "36px"};
          display:flex;
          align-items:center;
          justify-content:center;
        "
      >

        ${
          selected
            ? `
              <div
                style="
                  position:absolute;
                  inset:0;
                  border-radius:50%;
                  border:2px solid ${
                    delayed ? "#ef4444" : "#2563eb"
                  };
                  opacity:0.35;
                  transform:scale(1.25);
                "
              ></div>
            `
            : ""
        }

        <div
          style="
            width:${selected ? "36px" : "32px"};
            height:${selected ? "36px" : "32px"};
            border-radius:50%;
            background:${delayed ? "#dc2626" : "#059669"};
            border:3px solid white;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:${selected ? "17px" : "15px"};
            box-shadow:0 3px 10px rgba(15,23,42,0.30);
            position:relative;
            z-index:2;
          "
        >
          🚆
        </div>

      </div>
    `,
    iconSize: selected ? [42, 42] : [36, 36],
    iconAnchor: selected
      ? [21, 21]
      : [18, 18],
  });

/* -------------------------------------------------------
   RECENTER MAP
------------------------------------------------------- */

function Recenter({ center }) {
  const map = useMap();

  useEffect(() => {
    if (isValidCoordinate(center)) {
      map.setView(center, map.getZoom(), {
        animate: true,
      });
    }
  }, [center, map]);

  return null;
}

/* -------------------------------------------------------
   POPUP CONTENT
------------------------------------------------------- */

function TrainPopup({ train }) {
  const delayed = Number(train?.currentDelay || 0) > 10;

  return (
    <div className="min-w-[220px] text-slate-800">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">

        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">
            {train?.trainName || "Unknown train"}
          </p>

          <p className="text-xs text-slate-500 mt-0.5">
            Train #{train?.trainNumber || "-"}
          </p>
        </div>

        <span
          className={`
            shrink-0
            inline-flex items-center
            px-2 py-1
            rounded-full
            text-[10px]
            font-semibold
            border
            ${
              delayed
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }
          `}
        >
          {delayed ? "Delayed" : "On Time"}
        </span>

      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3">

        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">
            Speed
          </p>
          <p className="text-xs font-semibold text-slate-800 mt-0.5">
            {Number(train?.speed || 0)} km/h
          </p>
        </div>

        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">
            Delay
          </p>
          <p
            className={`text-xs font-semibold mt-0.5 ${
              delayed ? "text-red-600" : "text-emerald-600"
            }`}
          >
            +{Number(train?.currentDelay || 0)} min
          </p>
        </div>

        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">
            Next Station
          </p>
          <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
            {train?.nextStation || "-"}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">
            ETA
          </p>
          <p className="text-xs font-semibold text-slate-800 mt-0.5">
            {train?.predictedETA || "-"}
          </p>
        </div>

      </div>
    </div>
  );
}

/* -------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------- */

export default function MapView({
  trains = [],
  selectedTrainId,
  onSelectTrain,
}) {
  const safeTrains = Array.isArray(trains) ? trains : [];

  const selected = safeTrains.find(
    (t) => t?.id === selectedTrainId
  );

  const center = useMemo(() => {
    const selectedPoint = toLatLng(
      selected?.currentLocation?.coordinates
    );

    if (selectedPoint) return selectedPoint;

    const firstValidPoint = safeTrains
      .map((t) =>
        toLatLng(t?.currentLocation?.coordinates)
      )
      .find(Boolean);

    return firstValidPoint || DEFAULT_CENTER;
  }, [selected, safeTrains]);

  const delayedCount = safeTrains.filter(
    (t) => Number(t?.currentDelay || 0) > 10
  ).length;

  const activeCount = safeTrains.filter((t) =>
    toLatLng(t?.currentLocation?.coordinates)
  ).length;

  return (
    <div
      className="
        relative
        w-full
        overflow-hidden
        rounded-xl
        border border-slate-200
        bg-white
        shadow-sm
      "
    >

      {/* -------------------------------------------------
          MAP HEADER
      ------------------------------------------------- */}
      <div
        className="
          flex flex-col sm:flex-row
          sm:items-center
          sm:justify-between
          gap-3
          px-4 sm:px-5
          py-3
          bg-white
          border-b border-slate-200
        "
      >

        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Live Train Network
          </h3>

          <p className="text-xs text-slate-500 mt-0.5">
            Current train positions and route status
          </p>
        </div>

        {/* MAP SUMMARY */}
        <div className="flex items-center gap-3 text-xs">

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600">
              {activeCount} active
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-slate-600">
              {delayedCount} delayed
            </span>
          </div>

        </div>
      </div>

      {/* -------------------------------------------------
          MAP
      ------------------------------------------------- */}
      <div className="relative w-full h-[420px] sm:h-[500px] lg:h-[540px]">

        <MapContainer
          center={center}
          zoom={5}
          className="w-full h-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Recenter center={center} />

          {safeTrains.map((t) => {
            const point = toLatLng(
              t?.currentLocation?.coordinates
            );

            if (!point) return null;

            const routeCoordinates = Array.isArray(
              t?.routeCoordinates
            )
              ? t.routeCoordinates.filter(isValidCoordinate)
              : [];

            const delayed =
              Number(t?.currentDelay || 0) > 10;

            const isSelected =
              t?.id === selectedTrainId;

            return (
              <React.Fragment
                key={t?.id || t?.trainNumber}
              >

                {/* ROUTE */}
                {routeCoordinates.length > 1 && (
                  <Polyline
                    positions={routeCoordinates}
                    pathOptions={{
                      color: delayed
                        ? "#ef4444"
                        : "#10b981",
                      weight: isSelected ? 5 : 3,
                      opacity: isSelected ? 0.8 : 0.55,
                      dashArray: isSelected
                        ? undefined
                        : "6 8",
                    }}
                  />
                )}

                {/* TRAIN */}
                <Marker
                  position={point}
                  icon={trainIcon(
                    delayed,
                    isSelected
                  )}
                  eventHandlers={{
                    click: () =>
                      onSelectTrain?.(t),
                  }}
                >
                  <Popup
                    closeButton={true}
                    offset={[0, -4]}
                  >
                    <TrainPopup train={t} />
                  </Popup>
                </Marker>

              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* -------------------------------------------------
            MAP LEGEND
        ------------------------------------------------- */}
        <div
          className="
            absolute
            bottom-4
            left-4
            z-[1000]
            bg-white/95
            backdrop-blur-sm
            border border-slate-200
            rounded-lg
            shadow-md
            px-3
            py-2.5
          "
        >
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Train Status
          </p>

          <div className="flex items-center gap-4">

            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-slate-600">
                On time
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-[11px] text-slate-600">
                Delayed
              </span>
            </div>

          </div>
        </div>

        {/* -------------------------------------------------
            SELECTED TRAIN INDICATOR
        ------------------------------------------------- */}
        {selected && (
          <div
            className="
              absolute
              top-4
              left-4
              right-4
              sm:left-auto
              sm:right-4
              z-[1000]
              max-w-[280px]
              bg-white
              border border-slate-200
              rounded-lg
              shadow-md
              px-3
              py-2.5
            "
          >
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Selected Train
            </p>

            <div className="flex items-center justify-between gap-3 mt-1">

              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {selected?.trainName ||
                    "Unknown train"}
                </p>

                <p className="text-[10px] text-slate-500">
                  #{selected?.trainNumber || "-"}
                </p>
              </div>

              <span
                className={`
                  shrink-0
                  px-2 py-1
                  rounded-md
                  text-[10px]
                  font-semibold
                  ${
                    Number(
                      selected?.currentDelay || 0
                    ) > 10
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-700"
                  }
                `}
              >
                +{Number(
                  selected?.currentDelay || 0
                )} min
              </span>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

