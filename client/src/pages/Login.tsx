import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "../api/client";
import { saveSession } from "../lib/session";
import AuthLayout from "../components/AuthLayout";
import AccesoConGoogle from "../components/AccesoConGoogle";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { apiError, useToast } from "../components/ui/useToast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const sesionExpirada = searchParams.get("expirada") === "1";
  const restablecida = searchParams.get("restablecida") === "1";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.token);
      saveSession(res.data);
      navigate("/dashboard");
    } catch (err) {
      toast.error(apiError(err, "Credenciales inválidas."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Entra al panel de tu negocio."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link className="font-medium text-teal-700 hover:underline" to="/register">
            Registra tu negocio
          </Link>
          <span className="mt-3 block text-xs">Si eres empleado, el dueño de tu negocio te da tu acceso.</span>
        </>
      }
    >
      <AccesoConGoogle>
        <form onSubmit={handleSubmit} className="space-y-5">
          {restablecida && (
            <p role="status" className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-700">
              Tu contraseña cambió. Entra con la nueva.
            </p>
          )}
          {sesionExpirada && (
            <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Tu sesión expiró, vuelve a iniciar sesión.
            </p>
          )}
          <Field label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                placeholder="tu@negocio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
          </Field>
          <div>
            <Field label="Contraseña">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              )}
            </Field>
            <Link to="/olvide" className="mt-2 inline-block text-sm font-medium text-teal-700 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </AccesoConGoogle>
    </AuthLayout>
  );
}
