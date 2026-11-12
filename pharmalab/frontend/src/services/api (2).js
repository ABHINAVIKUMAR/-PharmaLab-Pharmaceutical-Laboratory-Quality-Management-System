import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("pharmalab_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const fetchDashboardSummary = async () => {
  const response = await apiClient.get("/api/v1/dashboard/summary");
  return response.data;
};

export const checkBackendHealth = async () => {
  const response = await apiClient.get("/api/v1/health");
  return response.data;
};

export default apiClient;
