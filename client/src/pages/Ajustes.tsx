import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../api/client";
import Button from "../components/ui/Button";
import ErrorState from "../components/ui/ErrorState";
import { EsqueletoLista } from "../components/ui/Esqueleto";
import { Field, Input } from "../components/ui/Field";
import PageHeader from "../components/ui/PageHeader";
import { Card } from "../components/ui/Table";
import { apiError, useToast } from "../components/ui/useToast";
import { esDueno, type ContextoSesion } from "../lib/session";

interface MiCuenta {
  nombre: string;
  email: string;
  emailVerificado: string | null;
  // false si entra solo con Google: Ajustes ofrece "Crear contraseña".
  tienePassword: boolean;
  tenant: { id: string; nombre: string };
}

// Ajustes de quien tiene la sesión: su cuenta, su contraseña y (si es dueño) el negocio.
export default function Ajustes() {
  const [cuenta, setCuenta] = useState<MiCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  function load() {
    api
      .get("/me")
      .then((res) => {
        setCuenta(res.data);
        setErrorCarga(null);
      })
      .catch((err) => setErrorCarga(apiError(err, "No se pudieron cargar tus datos.")))
      .finally(() => setCargando(false));
  }

  useEffect(load, []);

  return (
    <>
      <PageHeader title="Ajustes" description="Tus datos para entrar a CitaFlow y los de tu negocio." />

      {cargando ? (
        <Card>
          <EsqueletoLista etiqueta="Cargando ajustes" filas={4} avatar={false} />
        </Card>
      ) : errorCarga || !cuenta ? (
        <Card>
          <ErrorState message={errorCarga ?? "No se pudieron cargar tus datos."} onRetry={load} />
        </Card>
      ) : (
        <div className="space-y-6">
          <MiCuentaForm cuenta={cuenta} onGuardado={setCuenta} />
          <PasswordForm
            tienePassword={cuenta.tienePassword}
            onCreada={() => setCuenta({ ...cuenta, tienePassword: true })}
          />
          {esDueno() && <NegocioForm cuenta={cuenta} onGuardado={setCuenta} />}
        </div>
      )}
    </>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
        <p className="mt-0.5 text-sm text-muted">{descripcion}</p>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function MiCuentaForm({ cuenta, onGuardado }: { cuenta: MiCuenta; onGuardado: (c: MiCuenta) => void }) {
  const { actualizarSesion } = useOutletContext<ContextoSesion>();
  const toast = useToast();
  const [nombre, setNombre] = useState(cuenta.nombre);
  const [email, setEmail] = useState(cuenta.email);
  const [passwordActual, setPasswordActual] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cambiaNombre = nombre.trim() !== cuenta.nombre;
  const cambiaEmail = email.trim() !== cuenta.email;
  // Cambiar el email pide la contraseña actual: sin verificar o sin contraseña, no se puede.
  const emailBloqueado = !cuenta.emailVerificado
    ? "Verifica tu correo actual para poder cambiarlo."
    : !cuenta.tienePassword
      ? "Crea una contraseña abajo para poder cambiar tu email."
      : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      // Solo lo que cambió; el email va con la contraseña actual.
      const res = await api.patch("/me", {
        ...(cambiaNombre && { nombre }),
        ...(cambiaEmail && { email, passwordActual }),
      });
      onGuardado(res.data);
      actualizarSesion({
        user: { nombre: res.data.nombre, email: res.data.email, verificado: res.data.emailVerificado !== null },
      });
      setPasswordActual("");
      toast.success(
        cambiaEmail
          ? `Tus datos se guardaron. Te mandamos un correo a ${res.data.email} para confirmarlo.`
          : "Tus datos se guardaron.",
      );
    } catch (err) {
      toast.error(apiError(err, "No se pudieron guardar tus datos."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion titulo="Mi cuenta" descripcion="Tu nombre y el email con el que entras.">
      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            {(id) => <Input id={id} value={nombre} onChange={(e) => setNombre(e.target.value)} required />}
          </Field>
          <Field
            label="Email"
            hint={emailBloqueado}
          >
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={emailBloqueado !== undefined}
                required
              />
            )}
          </Field>
          {cambiaEmail && (
            <Field label="Contraseña actual" hint="Para cambiar tu email confirma que eres tú.">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={passwordActual}
                  onChange={(e) => setPasswordActual(e.target.value)}
                  required
                />
              )}
            </Field>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={guardando || (!cambiaNombre && !cambiaEmail)}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Seccion>
  );
}

// Sin contraseña (entra solo con Google) la sección es "Crear contraseña" y no pide la actual.
function PasswordForm({ tienePassword, onCreada }: { tienePassword: boolean; onCreada: () => void }) {
  const toast = useToast();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (nueva !== confirmacion) {
      toast.error("La contraseña y su confirmación no coinciden.");
      return;
    }
    setGuardando(true);
    try {
      const res = await api.patch("/me/password", {
        ...(tienePassword && { passwordActual: actual }),
        passwordNueva: nueva,
      });
      // El token anterior ya no sirve: esta sesión sigue con el nuevo.
      localStorage.setItem("token", res.data.token);
      setActual("");
      setNueva("");
      setConfirmacion("");
      toast.success(
        tienePassword
          ? "Contraseña cambiada. Se cerraron tus otras sesiones."
          : "Contraseña creada. Ya puedes entrar también con tu correo y contraseña.",
      );
      if (!tienePassword) onCreada();
    } catch (err) {
      toast.error(apiError(err, tienePassword ? "No se pudo cambiar la contraseña." : "No se pudo crear la contraseña."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion
      titulo={tienePassword ? "Contraseña" : "Crear contraseña"}
      descripcion={
        tienePassword
          ? "Al cambiarla se cierran tus sesiones abiertas en otros dispositivos; esta sigue abierta."
          : "Entras con Google. Con una contraseña también podrás entrar con tu correo."
      }
    >
      <form onSubmit={handleSubmit}>
        <div className={`grid gap-4 ${tienePassword ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {tienePassword && (
            <Field label="Contraseña actual">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  required
                />
              )}
            </Field>
          )}
          <Field label={tienePassword ? "Contraseña nueva" : "Contraseña"} hint="Mínimo 8 caracteres.">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label={tienePassword ? "Confirma la nueva" : "Confírmala"}>
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
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={guardando}>
            {tienePassword ? "Cambiar contraseña" : "Crear contraseña"}
          </Button>
        </div>
      </form>
    </Seccion>
  );
}

function NegocioForm({ cuenta, onGuardado }: { cuenta: MiCuenta; onGuardado: (c: MiCuenta) => void }) {
  const { actualizarSesion } = useOutletContext<ContextoSesion>();
  const toast = useToast();
  const [nombre, setNombre] = useState(cuenta.tenant.nombre);
  const [guardando, setGuardando] = useState(false);
  const cambia = nombre.trim() !== cuenta.tenant.nombre;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await api.patch("/tenant", { nombre });
      onGuardado({ ...cuenta, tenant: res.data });
      actualizarSesion({ tenant: { nombre: res.data.nombre } });
      toast.success("El nombre del negocio se guardó.");
    } catch (err) {
      toast.error(apiError(err, "No se pudo guardar el nombre del negocio."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion titulo="Negocio" descripcion="Solo el dueño lo puede cambiar. Así aparece en el panel de todo tu equipo.">
      <form onSubmit={handleSubmit}>
        <Field label="Nombre del negocio">
          {(id) => <Input id={id} value={nombre} onChange={(e) => setNombre(e.target.value)} required />}
        </Field>
        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={guardando || !cambia}>
            Guardar nombre
          </Button>
        </div>
      </form>
    </Seccion>
  );
}
