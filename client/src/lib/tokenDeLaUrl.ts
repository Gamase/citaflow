import { useLayoutEffect, useState } from "react";

// Token de un enlace de correo (/verificar?token=…, /restablecer?token=…). Se lee una vez y
// se quita de la URL en seguida (history.replaceState): así no queda en el historial ni en
// la barra, y no se comparte si alguien copia la dirección. Además, index.html pide
// `referrer: no-referrer` para que nunca viaje en el Referer a recursos externos.
export function useTokenDeLaUrl(): string | null {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token"));
  useLayoutEffect(() => {
    if (new URLSearchParams(window.location.search).has("token")) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);
  return token;
}
