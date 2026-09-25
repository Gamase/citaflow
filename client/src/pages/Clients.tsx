import { useEffect, useState } from "react";
import api from "../api/client";

interface Client {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get("/clients").then((res) => setClients(res.data));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/clients", { nombre, telefono, email: email || undefined });
      setNombre("");
      setTelefono("");
      setEmail("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "No se pudo agregar el cliente.");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-6 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-ink)]">
        Clientes
      </h2>

      <form
        onSubmit={handleSubmit}
        className="mb-2 flex items-center gap-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-3 text-sm"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <input
          className="h-10 w-40 shrink-0 rounded-md border border-[var(--color-border)] px-3 text-sm"
          placeholder="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          required
        />
        <input
          className="h-10 w-48 shrink-0 rounded-md border border-[var(--color-border)] px-3 text-sm"
          placeholder="Email (opcional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="h-10 shrink-0 whitespace-nowrap rounded-md bg-[var(--color-teal)] px-4 text-sm font-medium text-white">
          Agregar
        </button>
      </form>

      {error && <p className="mb-6 text-sm text-red-600">{error}</p>}
      {!error && <div className="mb-6" />}

      <div className="space-y-2">
        {clients.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          >
            <span className="font-medium text-[var(--color-ink)]">{c.nombre}</span>
            <span className="text-sm text-gray-500">{c.telefono}</span>
          </div>
        ))}
        {clients.length === 0 && (
          <p className="text-sm text-gray-500">Todavía no tienes clientes.</p>
        )}
      </div>
    </div>
  );
}
