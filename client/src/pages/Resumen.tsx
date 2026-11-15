import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import Badge from "../components/ui/Badge";
import ErrorState from "../components/ui/ErrorState";
import { Esqueleto } from "../components/ui/Esqueleto";
import { CalendarIcon, CashIcon, UserXIcon, UsersIcon } from "../components/ui/Icons";
import PageHeader from "../components/ui/PageHeader";
import { Card } from "../components/ui/Table";
import Tarjeta from "../components/ui/Tarjeta";
import { apiError } from "../components/ui/useToast";
import { estados, type Estado } from "../lib/estados";
import { formatFecha, formatHora, formatPrecio } from "../lib/format";
import { getSession } from "../lib/session";

interface CitaCorta {
  id: string;
  fechaHora: string;
  estado: string;
  client: { nombre: string };
  service: { nombre: string };
}

interface Resumen {
  hoy: CitaCorta[];
  // true para el empleado: `hoy` trae solo las citas que él atiende (el dueño ve todas).
  hoySoloMias: boolean;
  proximas: CitaCorta[];
  mes: {
    porEstado: Record<Estado, number>;
    total: number;
    tasaNoAsistencia: number | null;
    // null para el empleado: el backend no se los manda.
    ingresos: number | null;
    // Top 5 por citas no canceladas del mes (solo conteos: también lo ve el empleado).
    serviciosMasPedidos: { id: string; nombre: string; citas: number }[];
  };
  totales: { clientes: number; servicios: number };
}

// Orden en que se muestran las barras: del flujo normal a los que liberan horario.
const ORDEN_ESTADOS: Estado[] = ["PENDIENTE", "CONFIRMADA", "COMPLETADA", "NO_ASISTIO", "CANCELADA"];

// Color de la barra de cada estado, a juego con su badge.
const BARRA: Record<string, string> = {
  amber: "bg-amber-500",
  teal: "bg-teal-500",
  ink: "bg-ink-900",
  neutral: "bg-line-strong",
  danger: "bg-danger",
};

const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long" });

// Citas con un filtro ya puesto (Citas lee `rango`, `estado` y `mias` de la URL).
function enCitas(rango: "hoy" | "mes", estado?: Estado, mias = false) {
  return `/dashboard/appointments?rango=${rango}${estado ? `&estado=${estado}` : ""}${mias ? "&mias=1" : ""}`;
}

function saludo() {
  const hora = new Date().getHours();
  const parte = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const nombre = getSession()?.user.nombre.trim().split(/\s+/)[0];
  return nombre ? `${parte}, ${nombre}` : parte;
}

// Inicio y fin de hoy y del mes en la hora local del navegador. El server está en UTC
// y no sabe cuándo empieza "hoy" para el negocio, así que los rangos los manda el front.
function rangos() {
  const ahora = new Date();
  const hoyDesde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const hoyHasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  const mesDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const mesHasta = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
  return {
    hoyDesde: hoyDesde.toISOString(),
    hoyHasta: hoyHasta.toISOString(),
    mesDesde: mesDesde.toISOString(),
    mesHasta: mesHasta.toISOString(),
  };
}

export default function ResumenPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  function load() {
    api
      .get("/dashboard/resumen", { params: rangos() })
      .then((res) => {
        setResumen(res.data);
        setErrorCarga(null);
      })
      .catch((err) => setErrorCarga(apiError(err, "No se pudo cargar el resumen.")))
      .finally(() => setCargando(false));
  }

  useEffect(load, []);

  const mes = nombreMes.format(new Date());
  // Al empleado el backend le manda en `hoy` solo sus citas: los títulos y enlaces lo dicen.
  const soloMias = resumen?.hoySoloMias ?? false;

  return (
    <>
      <PageHeader
        title={saludo()}
        description={`Así va ${getSession()?.tenant.nombre ?? "tu negocio"} hoy y en ${mes}.`}
      />

      {cargando ? (
        <EsqueletoResumen />
      ) : errorCarga || !resumen ? (
        <Card>
          <ErrorState message={errorCarga ?? "No se pudo cargar el resumen."} onRetry={load} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div
            className={`grid grid-cols-2 gap-3 sm:gap-4 ${resumen.mes.ingresos === null ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
          >
            <Tarjeta
              titulo={soloMias ? "Mis citas de hoy" : "Citas de hoy"}
              icono={<CalendarIcon className="size-5" />}
              tono="teal"
              to={enCitas("hoy", undefined, soloMias)}
              ariaLabel={soloMias ? "Ver mis citas de hoy." : "Ver las citas de hoy."}
              valor={String(resumen.hoy.length)}
              detalle={
                resumen.hoy.length === 0
                  ? soloMias
                    ? "No tienes citas hoy"
                    : "Nada agendado para hoy"
                  : `${resumen.hoy.filter((c) => c.estado === "PENDIENTE").length} por confirmar`
              }
            />
            {resumen.mes.ingresos !== null && (
              <Tarjeta
                titulo={`Ingresos de ${mes}`}
                icono={<CashIcon className="size-5" />}
                tono="amber"
                to={enCitas("mes", "COMPLETADA")}
                ariaLabel={`Ver las citas atendidas de ${mes}.`}
                valor={formatPrecio(resumen.mes.ingresos)}
                detalle={`${resumen.mes.porEstado.COMPLETADA} citas atendidas`}
              />
            )}
            <Tarjeta
              titulo="No asistencia"
              icono={<UserXIcon className="size-5" />}
              tono="danger"
              to={enCitas("mes", "NO_ASISTIO")}
              ariaLabel={`Ver las citas de ${mes} en que no asistieron.`}
              valor={
                resumen.mes.tasaNoAsistencia === null ? "—" : `${Math.round(resumen.mes.tasaNoAsistencia * 100)}%`
              }
              detalle={
                resumen.mes.tasaNoAsistencia === null
                  ? "Aún no hay citas atendidas este mes"
                  : `${resumen.mes.porEstado.NO_ASISTIO} de ${resumen.mes.porEstado.COMPLETADA + resumen.mes.porEstado.NO_ASISTIO} citas`
              }
            />
            <Tarjeta
              titulo="Clientes"
              icono={<UsersIcon className="size-5" />}
              tono="ink"
              to="/dashboard/clients"
              ariaLabel="Ver los clientes."
              valor={String(resumen.totales.clientes)}
              detalle={`${resumen.totales.servicios} ${resumen.totales.servicios === 1 ? "servicio" : "servicios"}`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-fg">Citas de {mes} por estado</h2>
                <span className="text-sm text-muted tabular-nums">{resumen.mes.total} en total</span>
              </div>
              <ul className="space-y-1">
                {ORDEN_ESTADOS.map((e) => {
                  const cantidad = resumen.mes.porEstado[e];
                  const ancho = resumen.mes.total === 0 ? 0 : (cantidad / resumen.mes.total) * 100;
                  const { label, tone } = estados[e]!;
                  return (
                    <li key={e}>
                      <Link
                        to={enCitas("mes", e)}
                        aria-label={`${label}: ${cantidad} en ${mes}. Ver esas citas.`}
                        className="-mx-2 grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-canvas"
                      >
                        <span className="text-muted">{label}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-subtle">
                          <div className={`h-full rounded-full ${BARRA[tone]}`} style={{ width: `${ancho}%` }} />
                        </div>
                        <span className="text-right text-base font-semibold text-fg tabular-nums">{cantidad}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-fg">Servicios más pedidos en {mes}</h2>
                <span className="shrink-0 text-sm text-muted">por citas</span>
              </div>
              {resumen.mes.serviciosMasPedidos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Aún no hay citas este mes.</p>
              ) : (
                <ol className="space-y-1">
                  {resumen.mes.serviciosMasPedidos.map((s, i) => {
                    const max = resumen.mes.serviciosMasPedidos[0]!.citas;
                    return (
                      <li key={s.id} className="grid grid-cols-[1.25rem_1fr_2.5rem] items-center gap-3 py-2 text-sm">
                        <span className="text-xs font-semibold text-faint tabular-nums">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-fg">{s.nombre}</p>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-subtle">
                            <div className="h-full rounded-full bg-teal-500" style={{ width: `${(s.citas / max) * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-right text-base font-semibold text-fg tabular-nums">{s.citas}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-3 text-xs text-muted">Cuenta las citas del mes que no se cancelaron.</p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ListaCitas
              titulo={soloMias ? "Mis citas de hoy" : "Hoy"}
              citas={resumen.hoy}
              vacio={soloMias ? "No tienes citas para hoy." : "No hay citas para hoy."}
              conFecha={false}
              pie={
                soloMias && (
                  <Link to={enCitas("hoy")} className="font-medium text-teal-700 hover:underline">
                    Ver todas las citas de hoy del negocio
                  </Link>
                )
              }
            />
            <ListaCitas
              titulo="Próximas citas"
              citas={resumen.proximas}
              vacio="No hay citas por venir."
              conFecha
            />
          </div>
        </div>
      )}
    </>
  );
}

function ListaCitas({
  titulo,
  citas,
  vacio,
  conFecha,
  pie,
}: {
  titulo: string;
  citas: CitaCorta[];
  vacio: string;
  conFecha: boolean;
  // Renglón al final de la tarjeta (p. ej. el enlace a todas las citas del negocio).
  pie?: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="border-b border-line px-5 py-3.5 text-base font-semibold text-fg">{titulo}</h2>
      {citas.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted">
          <p>{vacio}</p>
          <Link to="/dashboard/appointments" className="mt-2 inline-block font-medium text-teal-700 hover:underline">
            Agendar una cita
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {citas.map((c) => {
            const estado = estados[c.estado] ?? { label: c.estado, tone: "neutral" as const };
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
                <div className="w-20 shrink-0 text-sm tabular-nums sm:w-24">
                  {conFecha && <p className="text-xs text-muted">{formatFecha(c.fechaHora)}</p>}
                  <p className="font-medium text-fg">{formatHora(c.fechaHora)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{c.client.nombre}</p>
                  <p className="truncate text-xs text-muted">{c.service.nombre}</p>
                  {/* En móvil el estado va debajo: así el nombre no se corta. */}
                  <div className="mt-1 sm:hidden">
                    <Badge tone={estado.tone}>{estado.label}</Badge>
                  </div>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <Badge tone={estado.tone}>{estado.label}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pie && <div className="border-t border-line px-5 py-3 text-sm">{pie}</div>}
    </Card>
  );
}

// Mientras carga: la misma forma que el Resumen (cuatro tarjetas, las barras y dos listas).
function EsqueletoResumen() {
  return (
    <div role="status" aria-label="Cargando resumen" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4 sm:p-5">
            <div className="flex justify-between">
              <Esqueleto className="h-3.5 w-24" />
              <Esqueleto className="size-10 rounded-full" />
            </div>
            <Esqueleto className="h-8 w-20" />
            <Esqueleto className="h-3 w-28" />
          </Card>
        ))}
      </div>
      <Card className="space-y-4 p-5 sm:p-6">
        <Esqueleto className="h-4 w-48" />
        {Array.from({ length: 5 }, (_, i) => (
          <Esqueleto key={i} className="h-3 w-full" />
        ))}
      </Card>
    </div>
  );
}
