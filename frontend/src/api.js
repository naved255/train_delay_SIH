import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

export const api = axios.create({ baseURL: API_BASE, timeout: 20000 });

api.interceptors.request.use((config) => {
  const saved = localStorage.getItem("eta_auth");
  if (saved) {
    try {
      const { token } = JSON.parse(saved);
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error("[API] Invalid eta_auth in localStorage:", err);
    }
  }
  if (import.meta.env.DEV) {
    console.debug(`[API] ${String(config.method || "get").toUpperCase()} ${config.baseURL || ""}${config.url || ""}`, config.params || "");
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("[API] Request failed:", {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message:
        error.code === "ECONNABORTED"
          ? "Request timed out. The server may still be processing the data."
          : error.message,
    });
    if (error.response?.status === 401) {
      localStorage.removeItem("eta_auth");
    }
    return Promise.reject(error);
  }
);

export const register = (name, email, password) =>
  api.post("/auth/register", { name, email, password }).then((r) => r.data);
export const login = (email, password) =>
  api.post("/auth/login", { email, password }).then((r) => r.data);
export const getMe = () => api.get("/auth/me").then((r) => r.data);

export const getRunningTrains = (params = {}) => api.get("/trains/running", { params }).then((r) => r.data);
export const getTrains = () => api.get("/trains").then((r) => r.data);
export const getTrainLive = (trainNumber) => api.get(`/trains/${trainNumber}/live`).then((r) => r.data);
export const getTrainPredict = (trainNumber) => api.get(`/trains/${trainNumber}/predict`).then((r) => r.data);
export const getTrainForecast = (trainNumber) => api.get(`/trains/${trainNumber}/forecast`).then((r) => r.data);
export const getStations = () => api.get("/stations").then((r) => r.data);
export const getStationArrivals = (code) => api.get(`/stations/${code}/arrivals`).then((r) => r.data);
export const getCascade = (trainNumber) => api.get(`/cascade/${trainNumber}`).then((r) => r.data);
export const injectDelay = (payload) => api.post("/control/inject-delay", payload).then((r) => r.data);
export const assignPlatform = (payload) => api.post("/station/assign-platform", payload).then((r) => r.data);
export const sendAnnouncement = (payload) => api.post("/station/announcement", payload).then((r) => r.data);
export const getFeeder = () => api.get("/feeder").then((r) => r.data);
export const syncFeeder = (trainNumber) => api.post(`/feeder/${trainNumber}/sync`).then((r) => r.data);
