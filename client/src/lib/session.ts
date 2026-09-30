// Datos de presentación de la sesión (nombre del negocio y del usuario).
// El token sigue viviendo en su propia llave; esto solo alimenta el sidebar.

export interface Session {
  tenant: { id: string; nombre: string };
  user: { nombre: string; email: string };
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

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem(KEY);
}
