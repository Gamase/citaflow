import axios from "axios";
import { clearSession, LOGIN_EXPIRADA } from "../lib/session";

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

// 401 fuera de /auth/* = el token venció o ya no es válido: se cierra la sesión y se manda
// a login con aviso. En /auth/* el 401 es "contraseña incorrecta" y lo maneja la pantalla.
let redirigiendo = false;
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error.config?.url ?? "";
    if (error.response?.status === 401 && !url.startsWith("/auth/")) {
      if (!redirigiendo) {
        redirigiendo = true;
        clearSession();
        window.location.assign(LOGIN_EXPIRADA);
      }
      // La página se va a recargar en /login: no tiene caso que la pantalla muestre el error.
      return new Promise(() => {});
    }
    return Promise.reject(error);
  },
);

export default api;
