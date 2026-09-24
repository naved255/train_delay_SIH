import React, { useState } from "react";
import {
  ShieldCheck,
  Train,
  Building2,
  Radio,
  Bus,
  ArrowRight,
  Lock,
  Mail,
  UserPlus,
  User,
  CheckCircle2,
} from "lucide-react";
import { login, register } from "../api";

const ROLES = [
  {
    id: "PASSENGER",
    title: "Passenger",
    desc: "Live train tracking & ETA",
    icon: Train,
    demo: "passenger@railway.in",
  },
  {
    id: "STATION_STAFF",
    title: "Station Staff",
    desc: "Platforms & announcements",
    icon: Building2,
    demo: "station@railway.in",
  },
  {
    id: "CONTROL_ROOM",
    title: "Control Room",
    desc: "Network & delay monitoring",
    icon: Radio,
    demo: "control@railway.in",
  },
  {
    id: "FEEDER_MANAGER",
    title: "Feeder Manager",
    desc: "Coordinate feeder transport",
    icon: Bus,
    demo: "feeder@railway.in",
  },
];

export default function LoginView({ onLoginSuccess }) {
  const [mode, setMode] = useState("login");
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(ROLES[0].demo);
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectRole = (role) => {
    setSelectedRole(role);
    setEmail(role.demo);
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const data =
        mode === "login"
          ? await login(email, password)
          : await register(name, email, password);

      if (
        mode === "login" &&
        data.user.role !== selectedRole.id
      ) {
        throw new Error(
          `This account belongs to the ${data.user.role.replaceAll(
            "_",
            " "
          )} role. Select the matching role.`
        );
      }

      onLoginSuccess(data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Request failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <div className="min-h-screen bg-[#f5f7f9] text-slate-900 flex">

      {/* =====================================================
          LEFT SIDE — BRAND / VISUAL
      ====================================================== */}

      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-slate-950">

        {/* Subtle railway line background */}
        <div className="absolute inset-0 opacity-[0.07]">

          <div className="absolute left-[16%] top-[-10%] w-px h-[120%] bg-white rotate-[25deg]" />
          <div className="absolute left-[24%] top-[-10%] w-px h-[120%] bg-white rotate-[25deg]" />

          <div className="absolute left-[8%] top-[30%] w-[100%] h-px bg-white rotate-[-8deg]" />
          <div className="absolute left-[-10%] top-[38%] w-[120%] h-px bg-white rotate-[-8deg]" />

        </div>

        {/* Main content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">

          {/* Logo */}
          <div className="flex items-center gap-3">

            <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center">
              <Train className="w-6 h-6 text-slate-950" />
            </div>

            <div>
              <p className="font-semibold text-white tracking-tight">
                Railway Operations
              </p>

              <p className="text-[11px] text-slate-500">
                Network Management Platform
              </p>
            </div>

          </div>

          {/* Center content */}
          <div className="max-w-lg">

            <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-400 mb-5">
              Operations Hub
            </p>

            <h1 className="text-4xl xl:text-5xl font-semibold tracking-tight text-white leading-[1.1]">
              One platform for
              <span className="block text-slate-400">
                the entire railway network.
              </span>
            </h1>

            <p className="mt-6 text-sm leading-6 text-slate-400 max-w-md">
              Monitor trains, manage station operations,
              track delays and coordinate connected
              transport services from a single workspace.
            </p>

            {/* Feature list */}
            <div className="mt-9 space-y-4">

              <Feature
                title="Live train monitoring"
                text="Track running services and current delays."
              />

              <Feature
                title="Predictive ETA"
                text="Use real-time data to estimate arrival times."
              />

              <Feature
                title="Network coordination"
                text="Understand how disruptions affect connected services."
              />

            </div>

          </div>

          {/* Footer */}
          <div className="text-[11px] text-slate-600">
            Railway ETA Prediction Platform · Prototype
          </div>

        </div>
      </div>

      {/* =====================================================
          RIGHT SIDE — LOGIN
      ====================================================== */}

      <div className="flex-1 flex items-center justify-center p-5 sm:p-8">

        <div className="w-full max-w-[440px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">

            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <Train className="w-5 h-5 text-white" />
            </div>

            <div>
              <p className="font-semibold text-slate-900">
                Railway Operations
              </p>

              <p className="text-[11px] text-slate-500">
                Network Management Platform
              </p>
            </div>

          </div>

          {/* Heading */}
          <div className="mb-8">

            <p className="text-xs font-medium text-emerald-600 mb-2">
              {isRegister
                ? "CREATE ACCOUNT"
                : "WELCOME BACK"}
            </p>

            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
              {isRegister
                ? "Create your account"
                : "Sign in to your workspace"}
            </h2>

            <p className="text-sm text-slate-500 mt-2">
              {isRegister
                ? "Create a passenger account to access live railway services."
                : "Choose your workspace and continue to the dashboard."}
            </p>

          </div>

          {/* =================================================
              ROLE SELECTOR
          ================================================== */}

          {!isRegister && (
            <div className="mb-7">

              <label className="block text-xs font-medium text-slate-600 mb-2">
                Sign in as
              </label>

              <div className="grid grid-cols-2 gap-2">

                {ROLES.map((role) => {

                  const Icon = role.icon;
                  const active =
                    selectedRole.id === role.id;

                  return (
                    <button
                      type="button"
                      key={role.id}
                      onClick={() => selectRole(role)}
                      className={`
                        group text-left px-3 py-3 rounded-xl
                        border transition-all duration-150
                        ${
                          active
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }
                      `}
                    >

                      <div className="flex items-center gap-2.5">

                        <div
                          className={`
                            w-8 h-8 rounded-lg flex items-center justify-center
                            ${
                              active
                                ? "bg-emerald-500 text-white"
                                : "bg-slate-100 text-slate-500 group-hover:text-slate-700"
                            }
                          `}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        <div className="min-w-0">

                          <p
                            className={`
                              text-xs font-semibold truncate
                              ${
                                active
                                  ? "text-slate-900"
                                  : "text-slate-700"
                              }
                            `}
                          >
                            {role.title}
                          </p>

                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {role.desc}
                          </p>

                        </div>

                      </div>

                    </button>
                  );
                })}

              </div>
            </div>
          )}

          {/* =================================================
              FORM
          ================================================== */}

          <form
            onSubmit={submit}
            className="space-y-4"
          >

            {/* Error */}
            {error && (
              <div className="flex gap-2.5 items-start bg-rose-50 border border-rose-200 text-rose-600 px-3.5 py-3 rounded-xl text-xs">

                <span className="mt-0.5">!</span>

                <p>{error}</p>

              </div>
            )}

            {/* Name */}
            {isRegister && (
              <InputField
                label="Full name"
                icon={User}
                type="text"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                placeholder="Enter your full name"
                required
                minLength={2}
              />
            )}

            {/* Email */}
            <InputField
              label="Email address"
              icon={Mail}
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="you@example.com"
              required
            />

            {/* Password */}
            <InputField
              label="Password"
              icon={Lock}
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="Enter your password"
              required
              minLength={8}
            />

            {/* Demo credentials */}
            {!isRegister && (
              <div className="flex items-center justify-between text-[11px] pt-1">

                <span className="text-slate-400">
                  Demo account
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setEmail(selectedRole.demo);
                    setPassword("password123");
                    setError("");
                  }}
                  className="text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Use demo credentials
                </button>

              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="
                w-full mt-2
                bg-slate-900 hover:bg-slate-800
                disabled:bg-slate-300
                text-white
                py-3
                rounded-xl
                text-sm font-medium
                transition-colors
                flex items-center justify-center gap-2
              "
            >

              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait...
                </>
              ) : (
                <>
                  {isRegister
                    ? "Create passenger account"
                    : `Continue as ${selectedRole.title}`}

                  <ArrowRight className="w-4 h-4" />
                </>
              )}

            </button>

          </form>

          {/* =================================================
              REGISTER / LOGIN SWITCH
          ================================================== */}

          <div className="flex items-center gap-3 my-7">

            <div className="h-px bg-slate-200 flex-1" />

            <span className="text-[10px] text-slate-400">
              OR
            </span>

            <div className="h-px bg-slate-200 flex-1" />

          </div>

          <button
            type="button"
            onClick={() => {
              setMode(
                isRegister ? "login" : "register"
              );
              setError("");
            }}
            className="
              w-full
              border border-slate-200
              hover:border-slate-300
              hover:bg-slate-50
              text-slate-700
              py-3
              rounded-xl
              text-xs font-medium
              transition-all
              flex items-center justify-center gap-2
            "
          >

            {isRegister ? (
              <>
                <ShieldCheck className="w-4 h-4" />
                Already have an account? Sign in
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Create a new passenger account
              </>
            )}

          </button>

          {/* =================================================
              REGISTER INFO
          ================================================== */}

          {isRegister && (
            <div className="mt-5 flex gap-2.5 p-3.5 bg-slate-100 rounded-xl">

              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />

              <p className="text-[11px] leading-5 text-slate-500">
                New public accounts are created as
                <span className="font-medium text-slate-700">
                  {" "}Passenger
                </span>
                accounts. Staff and operational roles
                use their assigned accounts.
              </p>

            </div>
          )}

          {/* Demo note */}
          {!isRegister && (
            <p className="text-center text-[10px] text-slate-400 mt-6 leading-5">
              Demo accounts use password{" "}
              <span className="font-medium text-slate-500">
                password123
              </span>
              . Select a role above to switch accounts.
            </p>
          )}

        </div>

      </div>
    </div>
  );
}

/* =============================================================
   FEATURE ITEM
============================================================= */

function Feature({ title, text }) {
  return (
    <div className="flex gap-3">

      <div className="mt-0.5 w-5 h-5 rounded-full border border-emerald-500/30 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
      </div>

      <div>
        <p className="text-xs font-medium text-slate-300">
          {title}
        </p>

        <p className="text-[11px] text-slate-600 mt-1">
          {text}
        </p>
      </div>

    </div>
  );
}

/* =============================================================
   INPUT FIELD
============================================================= */

function InputField({
  label,
  icon: Icon,
  type,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}) {
  return (
    <div>

      <label className="block text-xs font-medium text-slate-600 mb-2">
        {label}
      </label>

      <div className="relative">

        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          className="
            w-full
            bg-white
            border border-slate-200
            focus:border-emerald-500
            focus:ring-2
            focus:ring-emerald-500/10
            outline-none
            rounded-xl
            pl-10 pr-4
            py-3
            text-sm
            text-slate-900
            placeholder:text-slate-400
            transition-all
          "
        />

      </div>

    </div>
  );
}