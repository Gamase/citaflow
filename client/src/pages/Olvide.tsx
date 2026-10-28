import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { apiError, useToast } from "../components/ui/useToast";

// "Olvidé mi contraseña". El backend responde lo mismo exista o no la cuenta, así que aquí
// también: nunca se dice si el correo está registrado.
export default function Olvide() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await api.post("/auth/olvide", { email });
      setListo(res.data.mensaje);
    } catch (err) {
      toast.error(apiError(err, "No se pudo enviar. Intenta de nuevo."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      title="¿Olvidaste tu contraseña?"
      subtitle="Escribe el correo con el que entras y te mandamos un enlace para poner una nueva."
      footer={
        <>
          ¿La recordaste?{" "}
          <Link className="font-medium text-teal-700 hover:underline" to="/login">
            Inicia sesión
          </Link>
        </>
      }
    >
      {listo ? (
        <p role="status" className="rounded-md bg-teal-50 px-3 py-3 text-sm text-teal-700">
          {listo} El enlace vence en 1 hora. Revisa también la carpeta de spam.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
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
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Enviando…" : "Mandarme el enlace"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
