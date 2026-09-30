import axios from "axios";

// En desarrollo (npm run dev) siempre se usa el backend local, ignorando cualquier .env.
// En un build (Staging/Producción) VITE_API_URL es obligatoria: vite.config.ts aborta el build si falta.
const baseURL = import.meta.env.DEV
  ? "http://localhost:3000"
  : import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
