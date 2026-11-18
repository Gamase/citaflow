import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../api/client";
import QrReservas from "../components/QrReservas";
import Button from "../components/ui/Button";
import ErrorState from "../components/ui/ErrorState";
import { EsqueletoLista } from "../components/ui/Esqueleto";
import { Field, Input, Select } from "../components/ui/Field";
import PageHeader from "../components/ui/PageHeader";
import { Card } from "../components/ui/Table";
import { apiError, useToast } from "../components/ui/useToast";
import { etiquetaMinutos, NOMBRE_DIA, OPCIONES_MIN, ORDEN_SEMANA, type HorarioDia } from "../lib/horario";
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
  // Sube al guardar el horario: la tarjeta de reservas vuelve a preguntar si ya puede recibirlas.
  const [versionHorario, setVersionHorario] = useState(0);

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
          {esDueno() && <ReservasEnLinea version={versionHorario} />}
          {esDueno() && <HorarioForm onGuardado={() => setVersionHorario((v) => v + 1)} />}
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

// Horario de apertura, solo el dueño. Un día desmarcado está cerrado. Sin ningún día, el negocio
// acepta citas a cualquier hora (y se avisa). Se guarda la semana completa de un golpe.
type Tramo = { abreMin: number; cierraMin: number };
type Semana = Partial<Record<number, Tramo>>;

const TRAMO_NUEVO: Tramo = { abreMin: 9 * 60, cierraMin: 18 * 60 };

function aLista(semana: Semana): HorarioDia[] {
  return Object.entries(semana)
    .flatMap(([dia, t]) => (t ? [{ diaSemana: Number(dia), ...t }] : []))
    .sort((a, b) => a.diaSemana - b.diaSemana);
}

function aSemana(dias: HorarioDia[]): Semana {
  const semana: Semana = {};
  for (const d of dias) semana[d.diaSemana] = { abreMin: d.abreMin, cierraMin: d.cierraMin };
  return semana;
}

function HorarioForm({ onGuardado }: { onGuardado: () => void }) {
  const toast = useToast();
  const [semana, setSemana] = useState<Semana | null>(null);
  // Lo último guardado (serializado): para saber si hay cambios y si el negocio tiene horario.
  const [guardado, setGuardado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  function load() {
    api
      .get("/tenant/horario")
      .then((res) => {
        const s = aSemana(res.data.dias);
        setSemana(s);
        setGuardado(JSON.stringify(aLista(s)));
        setErrorCarga(null);
      })
      .catch((err) => setErrorCarga(apiError(err, "No se pudo cargar el horario.")));
  }

  useEffect(load, []);

  const descripcion = "Fuera de este horario no se pueden agendar citas. Un día desmarcado está cerrado.";

  if (errorCarga) {
    return (
      <Seccion titulo="Horario de apertura" descripcion={descripcion}>
        <ErrorState message={errorCarga} onRetry={load} />
      </Seccion>
    );
  }
  if (!semana) {
    return (
      <Seccion titulo="Horario de apertura" descripcion={descripcion}>
        <EsqueletoLista etiqueta="Cargando horario" filas={7} avatar={false} />
      </Seccion>
    );
  }

  const lista = aLista(semana);
  const hayCambios = JSON.stringify(lista) !== guardado;
  const sinHorario = guardado === "[]";

  function cambiar(dia: number, tramo: Tramo | null) {
    const nueva = { ...semana };
    if (tramo) nueva[dia] = tramo;
    else delete nueva[dia];
    setSemana(nueva);
  }

  function copiarATodos(dia: number) {
    const t = semana?.[dia];
    if (!t) return;
    const nueva: Semana = {};
    for (const d of ORDEN_SEMANA) nueva[d] = { ...t };
    setSemana(nueva);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await api.put("/tenant/horario", { dias: lista });
      const s = aSemana(res.data.dias);
      setSemana(s);
      setGuardado(JSON.stringify(aLista(s)));
      toast.success(lista.length === 0 ? "Horario quitado: se aceptan citas a cualquier hora." : "Horario guardado.");
      onGuardado();
    } catch (err) {
      toast.error(apiError(err, "No se pudo guardar el horario."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion titulo="Horario de apertura" descripcion={descripcion}>
      {sinHorario && (
        <p role="status" className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aún no configuras tu horario; por ahora se aceptan citas a cualquier hora.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <ul className="divide-y divide-line">
          {ORDEN_SEMANA.map((dia) => {
            const t = semana[dia];
            return (
              <li key={dia} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <label className="flex w-32 items-center gap-2 text-sm font-medium text-fg">
                  <input
                    type="checkbox"
                    className="size-4 accent-teal-700"
                    checked={!!t}
                    onChange={(e) => cambiar(dia, e.target.checked ? { ...TRAMO_NUEVO } : null)}
                  />
                  {NOMBRE_DIA[dia]}
                </label>
                {t ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      de
                      <Select
                        aria-label={`Hora de apertura del ${NOMBRE_DIA[dia]}`}
                        className="h-9 w-auto"
                        value={t.abreMin}
                        onChange={(e) => {
                          const abre = Number(e.target.value);
                          cambiar(dia, { abreMin: abre, cierraMin: Math.max(t.cierraMin, abre + 30) });
                        }}
                      >
                        {OPCIONES_MIN.filter((m) => m < 1440).map((m) => (
                          <option key={m} value={m}>
                            {etiquetaMinutos(m)}
                          </option>
                        ))}
                      </Select>
                      a
                      <Select
                        aria-label={`Hora de cierre del ${NOMBRE_DIA[dia]}`}
                        className="h-9 w-auto"
                        value={t.cierraMin}
                        onChange={(e) => cambiar(dia, { ...t, cierraMin: Number(e.target.value) })}
                      >
                        {OPCIONES_MIN.filter((m) => m > t.abreMin).map((m) => (
                          <option key={m} value={m}>
                            {etiquetaMinutos(m)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="link-muted" onClick={() => copiarATodos(dia)}>
                      Copiar a todos los días
                    </Button>
                  </>
                ) : (
                  <span className="text-sm text-faint">Cerrado</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={guardando || !hayCambios}>
            Guardar horario
          </Button>
        </div>
      </form>
    </Seccion>
  );
}

// El enlace público de reservas del negocio (/reservar/<slug>), para compartirlo con sus
// clientes. Solo funciona si el negocio tiene horario y al menos un servicio.
function ReservasEnLinea({ version }: { version: number }) {
  const toast = useToast();
  const [datos, setDatos] = useState<{ slug: string | null; tieneHorario: boolean; tieneServicios: boolean } | null>(null);

  useEffect(() => {
    api
      .get("/tenant/reservas")
      .then((res) => setDatos(res.data))
      .catch(() => setDatos(null));
  }, [version]);

  if (!datos?.slug) return null;

  const enlace = `${window.location.origin}/reservar/${datos.slug}`;
  const falta = !datos.tieneHorario
    ? "Configura tu horario de apertura (abajo) para empezar a recibir reservas."
    : !datos.tieneServicios
      ? "Da de alta al menos un servicio para empezar a recibir reservas."
      : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  return (
    <Seccion
      titulo="Reservas en línea"
      descripcion="Comparte este enlace (o su código QR, para imprimirlo) con tus clientes: eligen servicio y hora, y la cita te llega como pendiente."
    >
      {falta && (
        <p role="status" className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {falta}
        </p>
      )}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Input aria-label="Enlace público de reservas" className="min-w-0 basis-full sm:basis-auto sm:flex-1" value={enlace} readOnly onFocus={(e) => e.target.select()} />
          <Button variant="secondary" onClick={copiar}>
            Copiar enlace
          </Button>
          <a
            href={enlace}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-teal-700 hover:underline"
          >
            Abrir
          </a>
        </div>
        {/* Como el aviso: mientras el negocio no pueda recibir reservas, no hay QR que imprimir. */}
        {!falta && <QrReservas enlace={enlace} slug={datos.slug} />}
      </div>
    </Seccion>
  );
}
