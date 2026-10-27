import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "../api/client";
import { saveSession } from "../lib/session";
import AuthLayout from "../components/AuthLayout";
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
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthLayout>
  );
}
