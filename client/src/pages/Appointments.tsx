import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import { Field, Input, Select } from "../components/ui/Field";
import { CalendarIcon, PlusIcon } from "../components/ui/Icons";
import PageHeader from "../components/ui/PageHeader";
import { Card, Table, Td, Th, Tr } from "../components/ui/Table";
import { apiError, useToast } from "../components/ui/useToast";
import { estados, type Estado } from "../lib/estados";
import { formatDatetimeLocal, formatFecha, formatHora } from "../lib/format";

interface Client {
  id: string;
  nombre: string;
}

interface Service {
  id: string;
  nombre: string;
}

interface Appointment {
  id: string;
  fechaHora: string;
  estado: string;
  client: Client;
  service: Service;
}

// Estados a los que se puede llegar con una acción (a PENDIENTE nunca se vuelve)
type Destino = Exclude<Estado, "PENDIENTE">;

// Acciones que ofrece cada estado. Refleja las transiciones del backend,
// que es quien las valida (409 si no se permite).
const ACCIONES: Record<string, Destino[]> = {
  PENDIENTE: ["CONFIRMADA", "COMPLETADA", "NO_ASISTIO", "CANCELADA"],
  CONFIRMADA: ["COMPLETADA", "NO_ASISTIO", "CANCELADA"],
};

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
  const [filtroEstado, setFiltroEstado] = useState<Estado | "">("");
  const [rango, setRango] = useState<Rango>("todas");
  // Subirlo vuelve a pedir todo (después de agendar o cambiar una cita, o al reintentar).
  const [version, setVersion] = useState(0);
  const toast = useToast();

  // Ya se usó: se quita de la URL para que recargar no vuelva a abrir el formulario.
  useEffect(() => {
    if (searchParams.has("cliente")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // La agenda se vuelve a pedir al cambiar un filtro; si llega una respuesta de un
  // filtro anterior después de la del actual, se ignora.
  useEffect(() => {
    let vigente = true;
    api
      .get("/appointments", { params: { estado: filtroEstado || undefined, ...fechasDelRango(rango) } })
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
  }, [filtroEstado, rango, version]);

  // Clientes y servicios para los selects del formulario: siempre completos, sin filtros.
  useEffect(() => {
    api
      .get("/clients")
      .then((res) => setClients(res.data))
      .catch((err) => setErrorCarga(apiError(err, "No se pudieron cargar los clientes.")));
    api
      .get("/services")
      .then((res) => setServices(res.data))
      .catch((err) => setErrorCarga(apiError(err, "No se pudieron cargar los servicios.")));
  }, [version]);

  function load() {
    setVersion((v) => v + 1);
  }

  const hayFiltros = filtroEstado !== "" || rango !== "todas";

  function quitarFiltros() {
    setFiltroEstado("");
    setRango("todas");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/appointments", {
        clientId,
        serviceId,
        fechaHora: new Date(fechaHora).toISOString(),
      });
      setClientId("");
      setServiceId("");
      setFechaHora("");
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

  function elegirAccion(id: string, estado: Destino) {
    setReagendando(null);
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
        <Card className="mb-6">
          <form onSubmit={handleSubmit} className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-fg">Agendar cita</h2>
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
            <div className="grid gap-4 sm:grid-cols-3">
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
              <Field label="Fecha y hora">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={fechaHora}
                    onChange={(e) => setFechaHora(e.target.value)}
                    required
                  />
                )}
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Agendar</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Rango de fechas">
            {RANGOS.map((r) => (
              <Button
                key={r.valor}
                size="sm"
                variant={rango === r.valor ? "primary" : "secondary"}
                aria-pressed={rango === r.valor}
                onClick={() => setRango(r.valor)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Select
            aria-label="Filtrar por estado"
            className="h-8 w-auto"
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
        </div>
        {cargando ? (
          <p className="px-4 py-14 text-center text-sm text-muted">Cargando citas…</p>
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
                <Th>Cliente y servicio</Th>
                <Th className="w-44">Fecha</Th>
                <Th className="w-36">Estado</Th>
                <Th align="right">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => {
                const estado = estados[a.estado] ?? { label: a.estado, tone: "neutral" as const };
                const cancelada = a.estado === "CANCELADA";
                const atenuada = cancelada || a.estado === "NO_ASISTIO";
                const yaEmpezo = new Date(a.fechaHora) <= new Date();
                const acciones = (ACCIONES[a.estado] ?? []).filter(
                  (d) => yaEmpezo || !SOLO_DESPUES_DEL_INICIO.includes(d),
                );
                const confirmando = porConfirmar?.id === a.id ? porConfirmar : null;
                // Solo los estados no finales (los que tienen acciones) se pueden reagendar.
                const reagendable = a.estado in ACCIONES;
                const moviendo = reagendando?.id === a.id ? reagendando : null;
                const nuevaFecha = moviendo?.fechaHora ? new Date(moviendo.fechaHora).toISOString() : null;
                const mismaFecha = moviendo?.fechaHora === formatDatetimeLocal(a.fechaHora);
                return (
                  <Tr key={a.id} className={atenuada ? "text-faint" : ""}>
                    <Td>
                      <p className={`font-medium ${atenuada ? "text-muted" : "text-fg"} ${cancelada ? "line-through" : ""}`}>
                        {a.client.nombre}
                      </p>
                      <p className={`text-xs ${atenuada ? "text-faint" : "text-muted"}`}>{a.service.nombre}</p>
                    </Td>
                    <Td className="tabular-nums">
                      <span className={atenuada ? "text-faint" : "text-fg"}>{formatFecha(a.fechaHora)}</span>
                      <span className={`ml-2 ${atenuada ? "text-faint" : "text-muted"}`}>{formatHora(a.fechaHora)}</span>
                    </Td>
                    <Td>
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                    </Td>
                    <Td align="right">
                      {moviendo ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Input
                            aria-label="Nueva fecha y hora"
                            type="datetime-local"
                            className="h-9 w-auto"
                            min={formatDatetimeLocal(new Date().toISOString())}
                            value={moviendo.fechaHora}
                            onChange={(e) => setReagendando({ id: a.id, fechaHora: e.target.value })}
                            autoFocus
                          />
                          <Button size="sm" variant="secondary" onClick={() => setReagendando(null)}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            disabled={!nuevaFecha || mismaFecha || cambiando === a.id}
                            onClick={() => reagendar(a.id, moviendo.fechaHora)}
                          >
                            {nuevaFecha && !mismaFecha
                              ? `Mover a ${formatFecha(nuevaFecha)} ${formatHora(nuevaFecha)}`
                              : "Elige otra fecha"}
                          </Button>
                        </div>
                      ) : confirmando ? (
                        <div className="flex items-center justify-end gap-3">
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
                        <div className="flex justify-end gap-4">
                          {reagendable && (
                            <Button
                              variant="link"
                              disabled={cambiando === a.id}
                              onClick={() => {
                                setPorConfirmar(null);
                                setReagendando({ id: a.id, fechaHora: formatDatetimeLocal(a.fechaHora) });
                              }}
                            >
                              Reagendar
                            </Button>
                          )}
                          {acciones.map((destino) => (
                            <Button
                              key={destino}
                              variant={ACCION[destino].variant}
                              disabled={cambiando === a.id}
                              onClick={() => elegirAccion(a.id, destino)}
                            >
                              {ACCION[destino].label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
