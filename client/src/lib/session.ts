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

// Para el contexto del <Outlet> de DashboardLayout: una página (Ajustes) cambia el nombre
// del usuario o del negocio y el sidebar se redibuja sin volver a entrar.
export interface ContextoSesion {
  actualizarSesion: (cambios: { user?: Partial<Session["user"]>; tenant?: Partial<Session["tenant"]> }) => void;
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

// Payload del JWT (base64url), sin verificar la firma: eso lo hace el backend.
function payloadDe(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  try {
    const payload = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Revisa el `exp` del JWT: aquí solo evitamos entrar al panel con un token ya vencido.
export function tokenVigente(token: string | null): boolean {
  const exp = payloadDe(token)?.exp;
  return typeof exp === "number" && exp * 1000 > Date.now();
}

// Id del usuario de la sesión (para marcar "Tú" en la UI; el backend no lo toma del front).
export function miUserId(): string | null {
  const id = payloadDe(localStorage.getItem("token"))?.userId;
  return typeof id === "string" ? id : null;
}
