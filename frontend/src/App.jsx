import React, { useEffect, useState } from "react";
import PassengerView from "./pages/PassengerView";
import ControlRoomView from "./pages/ControlRoomView";
import StationStaffView from "./pages/StationStaffView";
import FeederView from "./pages/FeederView";
import LoginView from "./pages/LoginView";
import Navbar from "./components/Navbar";
import { getMe } from "./api";

const DASHBOARDS = {
  PASSENGER: PassengerView,
  CONTROL_ROOM: ControlRoomView,
  STATION_STAFF: StationStaffView,
  FEEDER_MANAGER: FeederView,
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      try {
        const saved = JSON.parse(localStorage.getItem("eta_auth") || "null");
        if (!saved?.token) return;
        const data = await getMe();
        setUser(data.user);
        localStorage.setItem("eta_auth", JSON.stringify({ ...saved, user: data.user }));
      } catch {
        localStorage.removeItem("eta_auth");
      } finally {
        setChecking(false);
      }
    };
    validateSession();
  }, []);

  const handleLogin = (authData) => {
    localStorage.setItem("eta_auth", JSON.stringify(authData));
    setUser(authData.user);
  };

  const handleLogout = () => {
    localStorage.removeItem("eta_auth");
    setUser(null);
  };

  if (checking) return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">Validating session…</div>;
  if (!user) return <LoginView onLoginSuccess={handleLogin} />;

  const Dashboard = DASHBOARDS[user.role];
  if (!Dashboard) {
    handleLogout();
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar user={user} onLogout={handleLogout} />
      <main className="flex-1"><Dashboard user={user} /></main>
    </div>
  );
}
