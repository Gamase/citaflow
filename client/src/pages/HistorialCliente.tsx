import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import { CalendarIcon, PlusIcon } from "../components/ui/Icons";
import PageHeader from "../components/ui/PageHeader";
import { Card, Table, Td, Th, Tr } from "../components/ui/Table";
import Tarjeta from "../components/ui/Tarjeta";
import { apiError } from "../components/ui/useToast";
import { estados, type Estado } from "../lib/estados";
import { formatFecha, formatHora, formatPrecio, formatTelefono } from "../lib/format";

interface CitaHistorial {
  id: string;
  fechaHora: string;
  estado: string;
  service: { nombre: string };
}

interface Historial {
  cliente: { id: string; nombre: string; telefono: string; email: string | null };
  citas: CitaHistorial[];
  resumen: {
    total: number;
    porEstado: Record<Estado, number>;
    proxima: CitaHistorial | null;
    // null para el empleado: el backend no se lo manda.
    totalGastado: number | null;
  };
}

export default function HistorialCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  function load() {
    api
      .get(`/clients/${id}/historial`)
      .then((res) => {
        setHistorial(res.data);
        setErrorCarga(null);
      })
      .catch((err) => setErrorCarga(apiError(err, "No se pudo cargar el historial del cliente.")))
      .finally(() => setCargando(false));
  }

  useEffect(load, [id]);

  // Citas abre su formulario con este cliente ya elegido.
  const agendar = (
    <Button onClick={() => navigate(`/dashboard/appointments?cliente=${id}`)}>
      <PlusIcon />
      Agendar cita
    </Button>
  );

  const cliente = historial?.cliente;

  return (
    <>
      <Link to="/dashboard/clients" className="mb-4 inline-block text-sm font-medium text-teal-700 hover:underline">
        ← Clientes
      </Link>
      <PageHeader
        title={cliente?.nombre ?? "Historial del cliente"}
        description={
          cliente
            ? [formatTelefono(cliente.telefono), cliente.email].filter(Boolean).join(" · ")
            : "Sus citas y cómo le ha ido con tu negocio."
        }
        action={historial && agendar}
      />

      {cargando ? (
        <Card>
          <p className="px-4 py-14 text-center text-sm text-muted">Cargando historial…</p>
        </Card>
      ) : errorCarga || !historial ? (
        <Card>
          <ErrorState message={errorCarga ?? "No se pudo cargar el historial del cliente."} onRetry={load} />
        </Card>
      ) : (
        <div className="space-y-6">
          <Resumen historial={historial} />

          <Card>
            {historial.citas.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon className="size-5" />}
                title="Este cliente aún no tiene citas"
                description="Agenda la primera desde aquí."
                action={agendar}
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th className="w-56">Fecha</Th>
                    <Th>Servicio</Th>
                    <Th className="w-36">Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {historial.citas.map((c) => {
                    const estado = estados[c.estado] ?? { label: c.estado, tone: "neutral" as const };
                    const atenuada = c.estado === "CANCELADA" || c.estado === "NO_ASISTIO";
                    return (
                      <Tr key={c.id} className={atenuada ? "text-faint" : ""}>
                        <Td className="tabular-nums">
                          <span className={atenuada ? "text-faint" : "text-fg"}>{formatFecha(c.fechaHora)}</span>
                          <span className={`ml-2 ${atenuada ? "text-faint" : "text-muted"}`}>
                            {formatHora(c.fechaHora)}
                          </span>
                        </Td>
                        <Td className={atenuada ? "text-muted" : "text-fg"}>{c.service.nombre}</Td>
                        <Td>
                          <Badge tone={estado.tone}>{estado.label}</Badge>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Resumen({ historial }: { historial: Historial }) {
  const { total, porEstado, proxima, totalGastado } = historial.resumen;
  const conGastado = totalGastado !== null;
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${conGastado ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      <Tarjeta
        titulo="Próxima cita"
        valor={proxima ? `${formatFecha(proxima.fechaHora)} ${formatHora(proxima.fechaHora)}` : "—"}
        detalle={proxima ? `${proxima.service.nombre} · ${estados[proxima.estado]?.label ?? proxima.estado}` : "Nada agendado"}
      />
      <Tarjeta
        titulo="Citas"
        valor={String(total)}
        detalle={`${porEstado.COMPLETADA} ${porEstado.COMPLETADA === 1 ? "atendida" : "atendidas"}`}
      />
      <Tarjeta
        titulo="No asistió / Canceladas"
        valor={`${porEstado.NO_ASISTIO} / ${porEstado.CANCELADA}`}
        detalle="No asistió libera el horario igual que cancelar"
      />
      {conGastado && (
        <Tarjeta
          titulo="Total gastado"
          valor={formatPrecio(totalGastado)}
          detalle="Suma de sus citas atendidas"
        />
      )}
    </div>
  );
}
