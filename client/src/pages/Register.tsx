import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { saveSession } from "../lib/session";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { useToast } from "../components/ui/useToast";

export default function Register() {
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await api.post("/auth/register", {
        nombreNegocio,
        nombreUsuario,
        email,
        password,
      });
      localStorage.setItem("token", res.data.token);
      saveSession(res.data);
      navigate("/dashboard");
    } catch {
      toast.error("No se pudo registrar. Revisa los datos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      title="Registra tu negocio"
      subtitle="Crea tu espacio en CitaFlow en menos de un minuto."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link className="font-medium text-teal-700 hover:underline" to="/login">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Nombre del negocio">
          {(id) => (
            <Input
              id={id}
              autoComplete="organization"
              placeholder="Barbería El Corte"
              value={nombreNegocio}
              onChange={(e) => setNombreNegocio(e.target.value)}
              required
            />
          )}
        </Field>
        <Field label="Tu nombre">
          {(id) => (
            <Input
              id={id}
              autoComplete="name"
              value={nombreUsuario}
              onChange={(e) => setNombreUsuario(e.target.value)}
              required
            />
          )}
        </Field>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? "Creando tu negocio…" : "Crear cuenta"}
        </Button>
      </form>
    </AuthLayout>
  );
}
