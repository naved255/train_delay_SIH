import React from "react";
import {
  Train,
  LogOut,
  User,
  Building2,
  Radio,
  Bus,
} from "lucide-react";

export default function Navbar({ user, onLogout }) {
  const getRoleConfig = (role) => {
    switch (role) {
      case "CONTROL_ROOM":
        return {
          label: "Control Room Chief",
          badge:
            "bg-rose-50 text-rose-700 border-rose-200",
          icon: Radio,
        };

      case "STATION_STAFF":
        return {
          label: "Station Master",
          badge:
            "bg-blue-50 text-blue-700 border-blue-200",
          icon: Building2,
        };

      case "FEEDER_MANAGER":
        return {
          label: "Feeder Manager",
          badge:
            "bg-amber-50 text-amber-700 border-amber-200",
          icon: Bus,
        };

      default:
        return {
          label: "Passenger",
          badge:
            "bg-emerald-50 text-emerald-700 border-emerald-200",
          icon: User,
        };
    }
  };

  const roleConfig = getRoleConfig(user?.role);
  const RoleIcon = roleConfig.icon;

  return (
    <nav
      className="
        sticky top-0 z-50
        bg-white
        border-b border-slate-200
        shadow-sm
      "
    >
      <div
        className="
          max-w-[1600px]
          mx-auto
          px-3 sm:px-5 lg:px-8
          h-16
          flex items-center justify-between
          gap-3
        "
      >
        {/* BRAND */}
        <div className="flex items-center min-w-0">
          <div
            className="
              w-9 h-9 sm:w-10 sm:h-10
              rounded-lg
              bg-red-700
              flex items-center justify-center
              shrink-0
            "
          >
            <Train className="w-5 h-5 text-white" />
          </div>

          <div className="ml-2.5 sm:ml-3 min-w-0">
            <h1
              className="
                text-sm sm:text-base
                font-bold
                text-slate-900
                leading-tight
                truncate
              "
            >
              Indian Railways ETA Portal
            </h1>

            <p
              className="
                hidden sm:block
                text-[10px] lg:text-xs
                text-slate-500
                mt-0.5
                truncate
              "
            >
              Dynamic Multimodal Operations Engine
            </p>
          </div>
        </div>

        {/* USER AREA */}
        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* USER / ROLE INFO */}
            <div
              className="
                flex items-center
                gap-2
                min-w-0
              "
            >
              {/* ROLE ICON */}
              <div
                className={`
                  w-8 h-8
                  sm:w-9 sm:h-9
                  rounded-lg
                  border
                  flex items-center justify-center
                  shrink-0
                  ${roleConfig.badge}
                `}
              >
                <RoleIcon className="w-4 h-4" />
              </div>

              {/* DETAILS */}
              <div className="hidden sm:block min-w-0">
                <p
                  className="
                    text-sm
                    font-semibold
                    text-slate-900
                    leading-tight
                    truncate
                    max-w-[150px] lg:max-w-[220px]
                  "
                >
                  {user.name || "Operator"}
                </p>

                <p
                  className="
                    text-[10px]
                    lg:text-xs
                    text-slate-500
                    mt-0.5
                    truncate
                    max-w-[180px] lg:max-w-[300px]
                  "
                >
                  {user.roleDetail
                    ? `${roleConfig.label} • ${user.roleDetail}`
                    : roleConfig.label}
                </p>
              </div>

              {/* MOBILE USER NAME */}
              <div className="sm:hidden min-w-0">
                <p
                  className="
                    text-xs
                    font-semibold
                    text-slate-800
                    max-w-[90px]
                    truncate
                  "
                >
                  {user.name || "Operator"}
                </p>

                <p
                  className="
                    text-[9px]
                    text-slate-500
                    mt-0.5
                    max-w-[90px]
                    truncate
                  "
                >
                  {roleConfig.label}
                </p>
              </div>
            </div>

            {/* DIVIDER */}
            <div className="hidden sm:block h-7 w-px bg-slate-200" />

            {/* LOGOUT */}
            <button
              onClick={onLogout}
              className="
                inline-flex items-center justify-center
                gap-1.5
                h-9
                px-2.5 sm:px-3
                rounded-lg
                border border-slate-300
                bg-white
                text-slate-600
                hover:bg-red-50
                hover:border-red-200
                hover:text-red-700
                transition
                text-xs
                font-medium
                shrink-0
              "
              title="Sign out of system"
            >
              <LogOut className="w-4 h-4" />

              <span className="hidden sm:inline">
                Sign Out
              </span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

