import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import { EsqueletoLista } from "../components/ui/Esqueleto";
import { Textarea } from "../components/ui/Field";
import { CalendarIcon, PlusIcon } from "../components/ui/Icons";
import PageHeader from "../components/ui/PageHeader";
import { Card, Table, Td, Th, Tr } from "../components/ui/Table";
import Tarjeta from "../components/ui/Tarjeta";
import { apiError, useToast } from "../components/ui/useToast";
import { estados, type Estado } from "../lib/estados";
import { formatFecha, formatHora, formatPrecio, formatTelefono } from "../lib/format";

interface CitaHistorial {
  id: string;
  fechaHora: string;
  estado: string;
  service: { nombre: string };
}

interface Historial {
  cliente: { id: string; nombre: string; telefono: string; email: string | null; notas: string | null };
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
          <EsqueletoLista etiqueta="Cargando historial" filas={4} avatar={false} />
        </Card>
      ) : errorCarga || !historial ? (
        <Card>
          <ErrorState message={errorCarga ?? "No se pudo cargar el historial del cliente."} onRetry={load} />
        </Card>
      ) : (
        <div className="space-y-6">
          <Resumen historial={historial} />

          <Notas
            cliente={historial.cliente}
            onGuardadas={(notas) => setHistorial({ ...historial, cliente: { ...historial.cliente, notas } })}
          />

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
        // La fecha es un texto largo: en tamaño de número se partía en tres renglones. Arriba va
        // solo el día y la hora baja al detalle.
        texto
        valor={proxima ? formatFecha(proxima.fechaHora) : "—"}
        detalle={
          proxima
            ? `${formatHora(proxima.fechaHora)} · ${proxima.service.nombre} · ${estados[proxima.estado]?.label ?? proxima.estado}`
            : "Nada agendado"
        }
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

// Notas libres sobre el cliente. Las ven y editan dueño y empleado (PATCH /clients/:id).
function Notas({
  cliente,
  onGuardadas,
}: {
  cliente: Historial["cliente"];
  onGuardadas: (notas: string | null) => void;
}) {
  const toast = useToast();
  const [texto, setTexto] = useState(cliente.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const hayCambios = texto.trim() !== (cliente.notas ?? "");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      // Vacío = quitar las notas (el backend lo guarda como null).
      const res = await api.patch(`/clients/${cliente.id}`, { notas: texto.trim() || null });
      onGuardadas(res.data.notas ?? null);
      setTexto(res.data.notas ?? "");
      toast.success(res.data.notas ? "Notas guardadas." : "Notas quitadas.");
    } catch (err) {
      toast.error(apiError(err, "No se pudieron guardar las notas."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold text-fg">Notas</h2>
        <p className="mt-0.5 text-sm text-muted">Preferencias, alergias, recordatorios… Las ve todo el equipo del negocio.</p>
      </div>
      <form onSubmit={guardar} className="p-5">
        <Textarea
          aria-label="Notas del cliente"
          placeholder="Aún no hay notas de este cliente."
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-faint tabular-nums">{texto.length}/2000</span>
          <Button type="submit" size="sm" disabled={guardando || !hayCambios}>
            Guardar notas
          </Button>
        </div>
      </form>
    </Card>
  );
}
