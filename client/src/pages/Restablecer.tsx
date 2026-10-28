import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { apiError } from "../components/ui/useToast";
import { useTokenDeLaUrl } from "../lib/tokenDeLaUrl";

// Página del enlace de "olvidé mi contraseña": poner una contraseña nueva.
export default function Restablecer() {
  const token = useTokenDeLaUrl();
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "El enlace no es válido o ya venció.");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmacion) {
      setError("La contraseña y su confirmación no coinciden.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api.post("/auth/restablecer", { token, password });
      navigate("/login?restablecida=1");
    } catch (err) {
      setError(apiError(err, "No se pudo cambiar la contraseña."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      title="Pon una contraseña nueva"
      subtitle="Al cambiarla se cierran las sesiones que tengas abiertas."
      footer={
        <>
          ¿El enlace ya no sirve?{" "}
          <Link className="font-medium text-teal-700 hover:underline" to="/olvide">
            Pide otro
          </Link>
        </>
      }
    >
      {token ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Field label="Contraseña nueva" hint="Mínimo 8 caracteres.">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label="Confirma la contraseña">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                required
              />
            )}
          </Field>
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      ) : (
        <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </AuthLayout>
  );
}
