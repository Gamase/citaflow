import { useEffect, useState } from "react";
import api from "../api/client";

interface Service {
  id: string;
  nombre: string;
  duracionMin: number;
  precio: string;
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [nombre, setNombre] = useState("");
  const [duracionMin, setDuracionMin] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get("/services").then((res) => setServices(res.data));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/services", {
        nombre,
        duracionMin: Number(duracionMin),
        precio: Number(precio),
      });
      setNombre("");
      setDuracionMin("");
      setPrecio("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "No se pudo agregar el servicio.");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-6 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-ink)]">
        Servicios
      </h2>

      <form
        onSubmit={handleSubmit}
        className="mb-2 flex gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <input
          className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          placeholder="Nombre del servicio"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <input
          className="w-28 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          placeholder="Minutos"
          type="number"
          value={duracionMin}
          onChange={(e) => setDuracionMin(e.target.value)}
          required
        />
        <input
          className="w-28 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          placeholder="Precio"
          type="number"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          required
        />
        <button className="rounded-md bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white">
          Agregar
        </button>
      </form>

      {error && <p className="mb-6 text-sm text-red-600">{error}</p>}
      {!error && <div className="mb-6" />}

      <div className="space-y-2">
        {services.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          >
            <span className="font-medium text-[var(--color-ink)]">{s.nombre}</span>
            <span className="text-sm text-gray-500">
              {s.duracionMin} min · ${s.precio}
            </span>
          </div>
        ))}
        {services.length === 0 && (
          <p className="text-sm text-gray-500">Todavía no tienes servicios.</p>
        )}
      </div>
    </div>
  );
}
