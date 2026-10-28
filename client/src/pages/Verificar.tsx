import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import AuthLayout from "../components/AuthLayout";
import { apiError } from "../components/ui/useToast";
import { getSession, marcarVerificado } from "../lib/session";
import { useTokenDeLaUrl } from "../lib/tokenDeLaUrl";

// Página del enlace del correo de verificación. Pública: se puede abrir en otro dispositivo.
export default function Verificar() {
  const token = useTokenDeLaUrl();
  const [estado, setEstado] = useState<"verificando" | "ok" | "error">(token ? "verificando" : "error");
  const [mensaje, setMensaje] = useState(token ? "" : "El enlace no es válido o ya venció.");
  // En desarrollo React monta dos veces: sin esto el segundo intento gastaría el enlace.
  const enviado = useRef(false);

  useEffect(() => {
    if (!token || enviado.current) return;
    enviado.current = true;
    api
      .post("/auth/verificar", { token })
      .then(() => {
        marcarVerificado();
        setEstado("ok");
      })
      .catch((err) => {
        setMensaje(apiError(err, "El enlace no es válido o ya venció."));
        setEstado("error");
      });
  }, [token]);

  const conSesion = getSession() !== null && localStorage.getItem("token") !== null;
  const siguiente = conSesion ? { to: "/dashboard", texto: "Ir al panel" } : { to: "/login", texto: "Iniciar sesión" };

  return (
    <AuthLayout
      title={estado === "ok" ? "Correo verificado" : estado === "error" ? "No se pudo verificar" : "Verificando…"}
      subtitle={
        estado === "ok"
          ? "Listo: tu correo quedó confirmado."
          : estado === "error"
            ? mensaje
            : "Un momento, estamos confirmando tu correo."
      }
      footer={
        estado === "error" ? (
          <>Si ya tienes sesión, puedes pedir otro enlace desde el aviso de arriba del panel.</>
        ) : null
      }
    >
      {estado !== "verificando" && (
        <Link
          to={siguiente.to}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white shadow-card hover:bg-teal-800"
        >
          {siguiente.texto}
        </Link>
      )}
    </AuthLayout>
  );
}
