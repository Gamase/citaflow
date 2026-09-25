import { useEffect, useState } from "react";
import api from "../api/client";

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

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [fechaHora, setFechaHora] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get("/appointments").then((res) => setAppointments(res.data));
    api.get("/clients").then((res) => setClients(res.data));
    api.get("/services").then((res) => setServices(res.data));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/appointments", {
        clientId,
        serviceId,
        fechaHora: new Date(fechaHora).toISOString(),
      });
      setClientId("");
      setServiceId("");
      setFechaHora("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "No se pudo agendar la cita.");
    }
  }

  const estadoColor: Record<string, string> = {
    PENDIENTE: "bg-[var(--color-amber)]",
    CONFIRMADA: "bg-[var(--color-teal)]",
    CANCELADA: "bg-gray-400",
    COMPLETADA: "bg-gray-600",
  };

  return (
    <div className="max-w-3xl">
      <h2 className="mb-6 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-ink)]">
        Citas
      </h2>

      <form
        onSubmit={handleSubmit}
        className="mb-2 flex flex-wrap gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <select
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        >
          <option value="">Cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          required
        >
          <option value="">Servicio</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          type="datetime-local"
          value={fechaHora}
          onChange={(e) => setFechaHora(e.target.value)}
          required
        />
        <button className="rounded-md bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white">
          Agendar
        </button>
      </form>

      {error && <p className="mb-6 text-sm text-red-600">{error}</p>}
      {!error && <div className="mb-6" />}

      <div className="space-y-2">
        {appointments.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          >
            <div>
              <p className="font-medium text-[var(--color-ink)]">{a.client.nombre}</p>
              <p className="text-sm text-gray-500">
                {a.service.nombre} · {new Date(a.fechaHora).toLocaleString("es-MX")}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium text-white ${estadoColor[a.estado]}`}
            >
              {a.estado}
            </span>
          </div>
        ))}
        {appointments.length === 0 && (
          <p className="text-sm text-gray-500">Todavía no tienes citas agendadas.</p>
        )}
      </div>
    </div>
  );
}
