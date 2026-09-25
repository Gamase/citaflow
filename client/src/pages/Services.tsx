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

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editDuracion, setEditDuracion] = useState("");
  const [editPrecio, setEditPrecio] = useState("");

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

  async function handleDelete(id: string) {
    setError("");
    try {
      await api.delete(`/services/${id}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "No se pudo eliminar el servicio.");
    }
  }

  function startEdit(s: Service) {
    setEditId(s.id);
    setEditNombre(s.nombre);
    setEditDuracion(String(s.duracionMin));
    setEditPrecio(s.precio);
    setError("");
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit(id: string) {
    setError("");
    try {
      await api.patch(`/services/${id}`, {
        nombre: editNombre,
        duracionMin: Number(editDuracion),
        precio: Number(editPrecio),
      });
      setEditId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "No se pudo guardar el cambio.");
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-6 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-ink)]">
        Servicios
      </h2>

      <form
        onSubmit={handleSubmit}
        className="mb-2 flex items-center gap-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-3 text-sm"
          placeholder="Nombre del servicio"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <input
          className="h-10 w-28 shrink-0 rounded-md border border-[var(--color-border)] px-3 text-sm"
          placeholder="Minutos"
          type="number"
          value={duracionMin}
          onChange={(e) => setDuracionMin(e.target.value)}
          required
        />
        <input
          className="h-10 w-28 shrink-0 rounded-md border border-[var(--color-border)] px-3 text-sm"
          placeholder="Precio"
          type="number"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          required
        />
        <button className="h-10 shrink-0 whitespace-nowrap rounded-md bg-[var(--color-teal)] px-4 text-sm font-medium text-white">
          Agregar
        </button>
      </form>

      {error && <p className="mb-6 text-sm text-red-600">{error}</p>}
      {!error && <div className="mb-6" />}

      <div className="space-y-2">
        {services.map((s) =>
          editId === s.id ? (
            <div
              key={s.id}
              className="flex items-center gap-3 overflow-hidden rounded-lg border border-[var(--color-teal)] bg-[var(--color-surface)] px-4 py-3"
            >
              <input
                className="h-9 min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-2 text-sm"
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
              />
              <input
                className="h-9 w-20 shrink-0 rounded-md border border-[var(--color-border)] px-2 text-sm"
                type="number"
                value={editDuracion}
                onChange={(e) => setEditDuracion(e.target.value)}
              />
              <input
                className="h-9 w-20 shrink-0 rounded-md border border-[var(--color-border)] px-2 text-sm"
                type="number"
                value={editPrecio}
                onChange={(e) => setEditPrecio(e.target.value)}
              />
              <button
                onClick={() => saveEdit(s.id)}
                className="shrink-0 text-sm font-medium text-[var(--color-teal)] hover:text-[var(--color-teal-dark)]"
              >
                Guardar
              </button>
              <button
                onClick={cancelEdit}
                className="shrink-0 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
            >
              <span className="font-medium text-[var(--color-ink)]">{s.nombre}</span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  {s.duracionMin} min · ${s.precio}
                </span>
                <button
                  onClick={() => startEdit(s)}
                  className="text-sm text-[var(--color-teal)] hover:text-[var(--color-teal-dark)]"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
              </div>
            </div>
          )
        )}
        {services.length === 0 && (
          <p className="text-sm text-gray-500">Todavía no tienes servicios.</p>
        )}
      </div>
    </div>
  );
}
