import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import SelectorFechaHora from "../components/SelectorFechaHora";
import Avatar from "../components/ui/Avatar";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import { EsqueletoLista } from "../components/ui/Esqueleto";
import { Field, Select } from "../components/ui/Field";
import { CalendarIcon, PlusIcon } from "../components/ui/Icons";
import MenuAcciones, { type ItemMenu } from "../components/ui/MenuAcciones";
import PageHeader from "../components/ui/PageHeader";
import { Card, Table, Td, Th, Tr } from "../components/ui/Table";
import { apiError, useToast } from "../components/ui/useToast";
import { estados, type Estado } from "../lib/estados";
import { formatDatetimeLocal, formatFecha, formatHora, hoyLocal } from "../lib/format";
import { miUserId } from "../lib/session";

interface Client {
  id: string;
  nombre: string;
}

interface Service {
  id: string;
  nombre: string;
}

// Personas activas a las que se les puede asignar una cita (GET /appointments/personas).
interface Persona {
  id: string;
  nombre: string;
}

interface Appointment {
  id: string;
  fechaHora: string;
  estado: string;
  client: Client;
  service: Service;
  // null = "Sin asignar". `activo: false`: la persona fue desactivada y hay que reasignarla.
  atiende: { id: string; nombre: string; activo: boolean } | null;
}

// Estados a los que se puede llegar con una acción (a PENDIENTE nunca se vuelve)
type Destino = Exclude<Estado, "PENDIENTE">;

// Acciones que ofrece cada estado. Refleja las transiciones del backend,
// que es quien las valida (409 si no se permite).
const ACCIONES: Record<string, Destino[]> = {
  PENDIENTE: ["CONFIRMADA", "COMPLETADA", "NO_ASISTIO", "CANCELADA"],
  CONFIRMADA: ["COMPLETADA", "NO_ASISTIO", "CANCELADA"],
};

// La acción que queda visible en cada fila según su estado; las demás van al menú "⋯".
// Pendiente → Confirmar; Confirmada que ya empezó → Marcar atendida; Confirmada futura → Reagendar.
function accionPrincipal(estado: string, yaEmpezo: boolean): string | null {
  if (estado === "PENDIENTE") return "CONFIRMADA";
  if (estado === "CONFIRMADA") return yaEmpezo ? "COMPLETADA" : "reagendar";
  return null;
}

interface AccionFila {
  clave: string;
  label: string;
  variant: "link" | "link-muted" | "link-danger";
  tono?: ItemMenu["tono"];
  onSelect: () => void;
}

// Color de cada cambio de estado dentro del menú (como sus botones de antes).
const TONO_MENU: Record<string, ItemMenu["tono"]> = { NO_ASISTIO: "muted", CANCELADA: "danger" };

// Solo se ofrecen cuando la hora de inicio ya pasó (el backend también lo valida).
const SOLO_DESPUES_DEL_INICIO: Destino[] = ["COMPLETADA", "NO_ASISTIO"];

// Cómo se muestra cada acción. Las que llevan `pregunta` llevan a un estado final
// (irreversible) y piden confirmación en la misma fila.
const ACCION: Record<
  Destino,
  { label: string; variant: "link" | "link-muted" | "link-danger"; exito: string; pregunta?: string; si?: string }
> = {
  CONFIRMADA: { label: "Confirmar", variant: "link", exito: "Cita confirmada." },
  COMPLETADA: {
    label: "Marcar atendida",
    variant: "link",
    exito: "Cita marcada como atendida.",
    pregunta: "¿Marcar como atendida?",
    si: "Sí, atendida",
  },
  NO_ASISTIO: {
    label: "No asistió",
    variant: "link-muted",
    exito: "Marcada como no asistió. El horario quedó libre.",
    pregunta: "¿Marcar que no asistió?",
    si: "Sí, no asistió",
  },
  CANCELADA: {
    label: "Cancelar",
    variant: "link-danger",
    exito: "Cita cancelada. El horario quedó libre.",
    pregunta: "¿Cancelar la cita?",
    si: "Sí, cancelar",
  },
};

type Rango = "hoy" | "semana" | "mes" | "todas";

const RANGOS: { valor: Rango; label: string }[] = [
  { valor: "hoy", label: "Hoy" },
  { valor: "semana", label: "Esta semana" },
  { valor: "mes", label: "Este mes" },
  { valor: "todas", label: "Todas" },
];

function esRango(v: string | null): v is Rango {
  return RANGOS.some((r) => r.valor === v);
}

function esEstado(v: string | null): v is Estado {
  return v !== null && v in estados;
}

// Inicio y fin del rango en la hora local del navegador, igual que en el Resumen
// (el server está en UTC y no sabe cuándo empieza "hoy"). La semana empieza en lunes.
function fechasDelRango(rango: Rango) {
  const ahora = new Date();
  const [y, m, d] = [ahora.getFullYear(), ahora.getMonth(), ahora.getDate()];
  const lunes = d - ((ahora.getDay() + 6) % 7);
  const [desde, hasta] =
    rango === "hoy"
      ? [new Date(y, m, d), new Date(y, m, d + 1)]
      : rango === "semana"
        ? [new Date(y, m, lunes), new Date(y, m, lunes + 7)]
        : rango === "mes"
          ? [new Date(y, m, 1), new Date(y, m + 1, 1)]
          : [];
  return desde && hasta ? { desde: desde.toISOString(), hasta: hasta.toISOString() } : {};
}

// --- Agrupación por día (en la hora local del navegador) ---

const tituloDia = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" });

function claveDia(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nombreDia(clave: string) {
  const dia = new Date(`${clave}T00:00`);
  const hoy = new Date(`${hoyLocal()}T00:00`);
  const dias = Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
  const fecha = tituloDia.format(dia);
  return dias === 0 ? `Hoy · ${fecha}` : dias === 1 ? `Mañana · ${fecha}` : dias === -1 ? `Ayer · ${fecha}` : fecha;
}

interface Grupo<T> {
  clave: string;
  titulo: string;
  citas: T[];
}

function porDia<T extends { fechaHora: string }>(citas: T[]): Grupo<T>[] {
  const grupos: Grupo<T>[] = [];
  for (const c of citas) {
    const clave = claveDia(c.fechaHora);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.clave === clave) ultimo.citas.push(c);
    else grupos.push({ clave, titulo: nombreDia(clave), citas: [c] });
  }
  return grupos;
}

// En "Todas": primero de hoy en adelante (de la más cercana a la más lejana) y al final, aparte,
// las de días anteriores: los días del más reciente al más viejo, y dentro de cada día las horas
// en orden (como se vivió ese día). En los otros rangos, todo en orden.
function secciones<T extends { fechaHora: string }>(citas: T[], rango: Rango) {
  const ordenadas = [...citas].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
  if (rango !== "todas") return [{ titulo: null, grupos: porDia(ordenadas) }];
  const hoy = hoyLocal();
  const proximas = ordenadas.filter((c) => claveDia(c.fechaHora) >= hoy);
  const anteriores = ordenadas.filter((c) => claveDia(c.fechaHora) < hoy);
  return [
    { titulo: anteriores.length > 0 && proximas.length > 0 ? "Próximas" : null, grupos: porDia(proximas) },
    { titulo: "Anteriores", grupos: porDia(anteriores).reverse() },
  ].filter((s) => s.grupos.length > 0);
}

const COLUMNAS = 5;

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // ?cliente=<id> (desde el historial del cliente): abre el formulario con ese cliente elegido.
  const [searchParams, setSearchParams] = useSearchParams();
  const [mostrarForm, setMostrarForm] = useState(() => searchParams.has("cliente"));
  const [clientId, setClientId] = useState(() => searchParams.get("cliente") ?? "");
  const [serviceId, setServiceId] = useState("");
  const [fechaHora, setFechaHora] = useState("");
  const [porConfirmar, setPorConfirmar] = useState<{ id: string; estado: Destino } | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  // Cita que se está reagendando y la nueva fecha elegida (valor del datetime-local).
  const [reagendando, setReagendando] = useState<{ id: string; fechaHora: string } | null>(null);
  // Los filtros arrancan de la URL (?rango=mes&estado=COMPLETADA&mias=1): el Resumen enlaza
  // aquí con un filtro puesto. Un valor desconocido se ignora.
  const [filtroEstado, setFiltroEstado] = useState<Estado | "">(() => {
    const e = searchParams.get("estado");
    return esEstado(e) ? e : "";
  });
  const [rango, setRango] = useState<Rango>(() => {
    const r = searchParams.get("rango");
    return esRango(r) ? r : "todas";
  });
  const [soloMias, setSoloMias] = useState(() => searchParams.get("mias") === "1");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [atiendeId, setAtiendeId] = useState("");
  // Cita que se está reasignando y a quién ("" = Sin asignar).
  const [reasignando, setReasignando] = useState<{ id: string; atiendeId: string } | null>(null);
  const yo = miUserId();
  // Subirlo vuelve a pedir todo (después de agendar o cambiar una cita, o al reintentar).
  const [version, setVersion] = useState(0);
  const toast = useToast();

  // La URL refleja los filtros (recargar o compartir el enlace los conserva). ?cliente ya se usó
  // al abrir: aquí se quita para que recargar no vuelva a abrir el formulario.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (rango !== "todas") params.rango = rango;
    if (filtroEstado) params.estado = filtroEstado;
    if (soloMias) params.mias = "1";
    setSearchParams(params, { replace: true });
  }, [rango, filtroEstado, soloMias, setSearchParams]);

  // La agenda se vuelve a pedir al cambiar un filtro; si llega una respuesta de un
  // filtro anterior después de la del actual, se ignora.
  useEffect(() => {
    let vigente = true;
    api
      .get("/appointments", {
        params: { estado: filtroEstado || undefined, atiende: soloMias ? "yo" : undefined, ...fechasDelRango(rango) },
      })
      .then((res) => {
        if (!vigente) return;
        setAppointments(res.data);
        setErrorCarga(null);
      })
      .catch((err) => vigente && setErrorCarga(apiError(err, "No se pudieron cargar las citas.")))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [filtroEstado, rango, soloMias, version]);

  // Clientes, servicios y personas para los selects: siempre completos, sin filtros.
  useEffect(() => {
    api
      .get("/clients")
      .then((res) => setClients(res.data))
      .catch((err) => setErrorCarga(apiError(err, "No se pudieron cargar los clientes.")));
    api
      .get("/services")
      .then((res) => setServices(res.data))
      .catch((err) => setErrorCarga(apiError(err, "No se pudieron cargar los servicios.")));
    api
      .get("/appointments/personas")
      .then((res) => setPersonas(res.data))
      .catch((err) => setErrorCarga(apiError(err, "No se pudo cargar quién atiende.")));
  }, [version]);

  function load() {
    setVersion((v) => v + 1);
  }

  const hayFiltros = filtroEstado !== "" || rango !== "todas" || soloMias;

  function quitarFiltros() {
    setFiltroEstado("");
    setRango("todas");
    setSoloMias(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/appointments", {
        clientId,
        serviceId,
        fechaHora: new Date(fechaHora).toISOString(),
        atiendeId: atiendeId || null,
      });
      setClientId("");
      setServiceId("");
      setFechaHora("");
      setAtiendeId("");
      setMostrarForm(false);
      toast.success("Cita agendada.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo agendar la cita."));
    }
  }

  async function cambiarEstado(id: string, estado: Destino) {
    setCambiando(id);
    try {
      await api.patch(`/appointments/${id}/estado`, { estado });
      setPorConfirmar(null);
      toast.success(ACCION[estado].exito);
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo cambiar el estado de la cita."));
    } finally {
      setCambiando(null);
    }
  }

  async function reagendar(id: string, fechaLocal: string) {
    setCambiando(id);
    try {
      await api.patch(`/appointments/${id}`, { fechaHora: new Date(fechaLocal).toISOString() });
      setReagendando(null);
      toast.success("Cita reagendada.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo reagendar la cita."));
    } finally {
      setCambiando(null);
    }
  }

  async function reasignar(id: string, nuevo: string) {
    setCambiando(id);
    try {
      await api.patch(`/appointments/${id}/atiende`, { atiendeId: nuevo || null });
      setReasignando(null);
      toast.success("Cita reasignada.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo reasignar la cita."));
    } finally {
      setCambiando(null);
    }
  }

  function elegirAccion(id: string, estado: Destino) {
    setReagendando(null);
    setReasignando(null);
    if (ACCION[estado].pregunta) {
      setPorConfirmar({ id, estado });
    } else {
      cambiarEstado(id, estado);
    }
  }

  const faltanDatos = clients.length === 0 || services.length === 0;

  const botonNuevo = (
    <Button onClick={() => setMostrarForm(true)}>
      <PlusIcon />
      Agendar cita
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Citas"
        description="La agenda de tu negocio. No se permiten citas que choquen con la duración de otra."
        action={!mostrarForm && botonNuevo}
      />

      {mostrarForm && (
        <Card className="mb-6 animate-aparecer">
          <form onSubmit={handleSubmit} className="p-5 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-fg">Agendar cita</h2>
            {faltanDatos && (
              <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Para agendar necesitas al menos un{" "}
                <Link to="/dashboard/clients" className="font-medium underline">
                  cliente
                </Link>{" "}
                y un{" "}
                <Link to="/dashboard/services" className="font-medium underline">
                  servicio
                </Link>
                .
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Cliente">
                {(id) => (
                  <Select id={id} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                    <option value="">Selecciona un cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Servicio">
                {(id) => (
                  <Select id={id} value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
                    <option value="">Selecciona un servicio</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Atiende" hint="Cada persona tiene su propia agenda.">
                {(id) => (
                  <Select id={id} value={atiendeId} onChange={(e) => setAtiendeId(e.target.value)}>
                    <OpcionesPersonas personas={personas} yo={yo} />
                  </Select>
                )}
              </Field>
            </div>
            <div className="mt-5 border-t border-line pt-5">
              {/* La API rechaza citas en el pasado (400, con 5 min de margen): desde hoy, y hoy sin las horas que ya pasaron. */}
              <SelectorFechaHora valor={fechaHora} onChange={setFechaHora} min={hoyLocal()} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
              {/* Sin hora elegida el valor está incompleto ("2026-10-30" sin "T13:30"). */}
              <Button type="submit" disabled={fechaHora.length !== 16}>
                Agendar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {/* Una sola barra: rango, estado y "Mis citas". En móvil se acomoda en dos renglones. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas/60 p-3 sm:gap-3">
          <div
            className="flex w-full rounded-md border border-line-strong bg-surface p-0.5 sm:w-auto"
            role="group"
            aria-label="Rango de fechas"
          >
            {RANGOS.map((r) => (
              <button
                key={r.valor}
                type="button"
                aria-pressed={rango === r.valor}
                onClick={() => setRango(r.valor)}
                className={`h-8 flex-1 rounded px-3 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none ${
                  rango === r.valor ? "bg-teal-700 text-white shadow-card" : "text-muted hover:bg-subtle hover:text-fg"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Select
            aria-label="Filtrar por estado"
            className="h-9 flex-1 sm:w-52 sm:flex-none"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as Estado | "")}
          >
            <option value="">Todos los estados</option>
            {Object.entries(estados).map(([valor, { label }]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            className="h-9"
            variant={soloMias ? "primary" : "secondary"}
            aria-pressed={soloMias}
            onClick={() => setSoloMias((v) => !v)}
          >
            Mis citas
          </Button>
          {hayFiltros && (
            <Button variant="link-muted" className="sm:ml-auto" onClick={quitarFiltros}>
              Quitar filtros
            </Button>
          )}
        </div>
        {cargando ? (
          <EsqueletoLista etiqueta="Cargando citas" />
        ) : errorCarga ? (
          <ErrorState message={errorCarga} onRetry={load} />
        ) : appointments.length === 0 && hayFiltros ? (
          <div className="px-4 py-14 text-center text-sm text-muted">
            <p>No hay citas con estos filtros.</p>
            <Button variant="link" className="mt-2" onClick={quitarFiltros}>
              Quitar filtros
            </Button>
          </div>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon className="size-5" />}
            title="Aún no hay citas"
            description="Agenda la primera eligiendo un cliente, un servicio y un horario."
            action={!mostrarForm && botonNuevo}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-28">Hora</Th>
                <Th>Cliente y servicio</Th>
                <Th className="w-48">Atiende</Th>
                <Th className="w-36">Estado</Th>
                <Th align="right">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {secciones(appointments, rango).map((seccion) => (
                <Fragment key={seccion.titulo ?? "todas"}>
                  {seccion.titulo && (
                    <tr className="max-md:block">
                      <th
                        colSpan={COLUMNAS}
                        scope="colgroup"
                        className="border-b border-line bg-surface px-4 pt-6 pb-2 text-left text-base font-semibold text-fg max-md:block max-md:border-0 max-md:bg-transparent max-md:px-1 max-md:pt-4 max-md:pb-0"
                      >
                        {seccion.titulo}
                      </th>
                    </tr>
                  )}
                  {seccion.grupos.map((grupo) => (
                    <Fragment key={grupo.clave}>
                      <tr className="max-md:block">
                        <th
                          colSpan={COLUMNAS}
                          scope="colgroup"
                          className="border-b border-line bg-subtle/70 px-4 py-2 text-left text-xs font-semibold tracking-wide text-ink-700 uppercase max-md:block max-md:border-0 max-md:bg-transparent max-md:px-1 max-md:pt-2 max-md:pb-0"
                        >
                          {grupo.titulo}
                          <span className="ml-2 font-normal text-muted normal-case">
                            {grupo.citas.length} {grupo.citas.length === 1 ? "cita" : "citas"}
                          </span>
                        </th>
                      </tr>
                      {grupo.citas.map((a) => filaCita(a))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );

  // Una cita: su fila (en móvil, tarjeta) y, si se está reagendando, el selector debajo.
  function filaCita(a: Appointment) {
    const estado = estados[a.estado] ?? { label: a.estado, tone: "neutral" as const };
    const cancelada = a.estado === "CANCELADA";
    const atenuada = cancelada || a.estado === "NO_ASISTIO";
    const yaEmpezo = new Date(a.fechaHora) <= new Date();
    const acciones = (ACCIONES[a.estado] ?? []).filter((d) => yaEmpezo || !SOLO_DESPUES_DEL_INICIO.includes(d));
    const confirmando = porConfirmar?.id === a.id ? porConfirmar : null;
    // Solo los estados no finales (los que tienen acciones) se pueden reagendar.
    const reagendable = a.estado in ACCIONES;
    const moviendo = reagendando?.id === a.id ? reagendando : null;
    const completa = moviendo?.fechaHora.length === 16;
    const nuevaFecha = moviendo && completa ? new Date(moviendo.fechaHora).toISOString() : null;
    const mismaFecha = moviendo?.fechaHora === formatDatetimeLocal(a.fechaHora);
    const cambiandoA = reasignando?.id === a.id ? reasignando : null;

    // Todas las acciones de la fila; una queda visible y el resto va al menú "⋯".
    const disponibles: AccionFila[] = [
      ...(reagendable
        ? [
            {
              clave: "reagendar",
              label: "Reagendar",
              variant: "link" as const,
              onSelect: () => {
                setPorConfirmar(null);
                setReasignando(null);
                setReagendando({ id: a.id, fechaHora: formatDatetimeLocal(a.fechaHora) });
              },
            },
            {
              clave: "reasignar",
              label: "Reasignar",
              variant: "link" as const,
              onSelect: () => {
                setPorConfirmar(null);
                setReagendando(null);
                // Una persona inactiva no sale en el select: se arranca en "Sin asignar".
                setReasignando({ id: a.id, atiendeId: a.atiende?.activo ? a.atiende.id : "" });
              },
            },
          ]
        : []),
      ...acciones.map((destino) => ({
        clave: destino,
        label: ACCION[destino].label,
        variant: ACCION[destino].variant,
        tono: TONO_MENU[destino],
        onSelect: () => elegirAccion(a.id, destino),
      })),
    ];
    const principal = disponibles.find((x) => x.clave === accionPrincipal(a.estado, yaEmpezo));
    const secundarias = disponibles.filter((x) => x !== principal);
    // Sin nada que hacer (estado final): en móvil la celda de acciones no deja un hueco.
    const sinAcciones = !principal && secundarias.length === 0 && !cambiandoA && !moviendo && !confirmando;
    return (
      <Fragment key={a.id}>
        <Tr className={`${atenuada ? "text-faint" : ""} ${moviendo ? "bg-teal-50/50 hover:bg-teal-50/50" : ""}`}>
          <Td label="Hora" className="tabular-nums">
            <span className={`font-semibold ${atenuada ? "text-faint" : "text-fg"}`}>{formatHora(a.fechaHora)}</span>
          </Td>
          <Td className="max-md:order-first max-md:pb-2">
            <div className="min-w-0">
              <p
                className={`font-medium max-md:text-base ${atenuada ? "text-muted" : "text-fg"} ${cancelada ? "line-through" : ""}`}
              >
                {a.client.nombre}
              </p>
              <p className={`text-xs ${atenuada ? "text-faint" : "text-muted"}`}>{a.service.nombre}</p>
            </div>
          </Td>
          <Td label="Atiende">
            {a.atiende === null ? (
              <span className="inline-flex items-center gap-2 text-muted italic">
                <span
                  aria-hidden="true"
                  className="size-6 shrink-0 rounded-full border border-dashed border-line-strong"
                />
                Sin asignar
              </span>
            ) : (
              <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
                <Avatar nombre={a.atiende.nombre} tamano="sm" />
                <span className={a.atiende.id === yo ? "font-medium text-teal-700" : atenuada ? "" : "text-fg"}>
                  {a.atiende.id === yo ? "Tú" : a.atiende.nombre}
                </span>
                {/* Desactivada: la cita sigue a su nombre hasta que alguien la reasigne. */}
                {!a.atiende.activo && reagendable && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                    inactivo · reasígnala
                  </span>
                )}
              </span>
            )}
          </Td>
          <Td label="Estado">
            <Badge tone={estado.tone}>{estado.label}</Badge>
          </Td>
          <Td align="right" className={sinAcciones ? "max-md:hidden" : ""}>
            {cambiandoA ? (
              <div className="flex animate-aparecer flex-wrap items-center justify-end gap-2">
                <Select
                  aria-label="Quién atiende"
                  className="h-9 w-auto"
                  value={cambiandoA.atiendeId}
                  onChange={(e) => setReasignando({ id: a.id, atiendeId: e.target.value })}
                  autoFocus
                >
                  <OpcionesPersonas personas={personas} yo={yo} />
                </Select>
                <Button size="sm" variant="secondary" onClick={() => setReasignando(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={cambiandoA.atiendeId === (a.atiende?.id ?? "") || cambiando === a.id}
                  onClick={() => reasignar(a.id, cambiandoA.atiendeId)}
                >
                  Reasignar
                </Button>
              </div>
            ) : moviendo ? (
              <span className="text-sm text-teal-700">Reagendando…</span>
            ) : confirmando ? (
              <div className="flex animate-aparecer flex-wrap items-center justify-end gap-3">
                <span className="text-sm text-fg">{ACCION[confirmando.estado].pregunta}</span>
                <Button size="sm" variant="secondary" onClick={() => setPorConfirmar(null)} autoFocus>
                  No
                </Button>
                <Button
                  size="sm"
                  variant={confirmando.estado === "COMPLETADA" ? "primary" : "danger"}
                  disabled={cambiando === a.id}
                  onClick={() => cambiarEstado(a.id, confirmando.estado)}
                >
                  {ACCION[confirmando.estado].si}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                {principal && (
                  <Button variant={principal.variant} disabled={cambiando === a.id} onClick={principal.onSelect}>
                    {principal.label}
                  </Button>
                )}
                <MenuAcciones
                  etiqueta={`Más acciones para la cita de ${a.client.nombre}`}
                  items={secundarias.map((x) => ({
                    label: x.label,
                    tono: x.tono,
                    onSelect: x.onSelect,
                    disabled: cambiando === a.id,
                  }))}
                />
              </div>
            )}
          </Td>
        </Tr>
        {moviendo && (
          <Tr className="bg-teal-50/50 hover:bg-teal-50/50 max-md:-mt-4">
            <Td colSpan={COLUMNAS} className="whitespace-normal max-md:block">
              <div className="animate-aparecer space-y-4 py-1">
                <p className="text-sm font-medium text-fg">
                  Reagendar la cita de {a.client.nombre}
                  <span className="font-normal text-muted">
                    {" "}
                    · ahora: {formatFecha(a.fechaHora)}, {formatHora(a.fechaHora)}
                  </span>
                </p>
                <SelectorFechaHora
                  valor={moviendo.fechaHora}
                  onChange={(v) => setReagendando({ id: a.id, fechaHora: v })}
                  horaActual={formatDatetimeLocal(a.fechaHora).slice(11)}
                  min={hoyLocal()}
                  autoFocus
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setReagendando(null)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={!nuevaFecha || mismaFecha || cambiando === a.id}
                    onClick={() => reagendar(a.id, moviendo.fechaHora)}
                  >
                    {nuevaFecha && !mismaFecha
                      ? `Mover a ${formatFecha(nuevaFecha)}, ${formatHora(nuevaFecha)}`
                      : "Elige otra fecha u hora"}
                  </Button>
                </div>
              </div>
            </Td>
          </Tr>
        )}
      </Fragment>
    );
  }
}

// Opciones de "Atiende": Sin asignar + las personas activas del negocio (quien tiene la sesión, como "Tú").
function OpcionesPersonas({ personas, yo }: { personas: Persona[]; yo: string | null }) {
  return (
    <>
      <option value="">Sin asignar</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.id === yo ? `${p.nombre} (tú)` : p.nombre}
        </option>
      ))}
    </>
  );
}
