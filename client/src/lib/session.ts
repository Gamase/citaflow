// Datos de presentación de la sesión (nombre del negocio, del usuario y su rol).
// El token sigue viviendo en su propia llave; esto solo alimenta la UI. El rol aquí
// solo decide qué botones se muestran: quien de verdad lo hace cumplir es el backend.

export type Rol = "DUENO" | "EMPLEADO";

export interface Session {
  tenant: { id: string; nombre: string };
  user: { nombre: string; email: string; rol: Rol };
}

const KEY = "session";

export function saveSession(data: Partial<Session>) {
  if (data.tenant && data.user) {
    localStorage.setItem(KEY, JSON.stringify({ tenant: data.tenant, user: data.user }));
  }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function esDueno(): boolean {
  return getSession()?.user.rol === "DUENO";
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem(KEY);
}

// A dónde se manda al usuario cuando su sesión ya no sirve; Login muestra el aviso.
export const LOGIN_EXPIRADA = "/login?expirada=1";

// Revisa el `exp` del JWT leyendo su payload (base64url). No verifica la firma:
// eso lo hace el backend; aquí solo evitamos entrar al panel con un token ya vencido.
export function tokenVigente(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload)) as { exp?: unknown };
    return typeof exp === "number" && exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
