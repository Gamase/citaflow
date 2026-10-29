import { useEffect, useState } from "react";
import api from "../api/client";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import { EsqueletoLista } from "../components/ui/Esqueleto";
import { Field, Input } from "../components/ui/Field";
import { PlusIcon, TagIcon } from "../components/ui/Icons";
import PageHeader from "../components/ui/PageHeader";
import { Card, Table, Td, Th, Tr } from "../components/ui/Table";
import { apiError, useToast } from "../components/ui/useToast";
import { formatPrecio } from "../lib/format";
import { esDueno } from "../lib/session";

interface Service {
  id: string;
  nombre: string;
  duracionMin: number;
  precio: string;
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [duracionMin, setDuracionMin] = useState("");
  const [precio, setPrecio] = useState("");
  const toast = useToast();

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editDuracion, setEditDuracion] = useState("");
  const [editPrecio, setEditPrecio] = useState("");

  function load() {
    api
      .get("/services")
      .then((res) => {
        setServices(res.data);
        setErrorCarga(null);
      })
      .catch((err) => setErrorCarga(apiError(err, "No se pudieron cargar los servicios.")))
      .finally(() => setCargando(false));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/services", {
        nombre,
        duracionMin: Number(duracionMin),
        precio: Number(precio),
      });
      setNombre("");
      setDuracionMin("");
      setPrecio("");
      setMostrarForm(false);
      toast.success("Servicio agregado.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo agregar el servicio."));
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/services/${id}`);
      toast.success("Servicio eliminado.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo eliminar el servicio."));
    }
  }

  function startEdit(s: Service) {
    setEditId(s.id);
    setEditNombre(s.nombre);
    setEditDuracion(String(s.duracionMin));
    setEditPrecio(s.precio);
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit(id: string) {
    try {
      await api.patch(`/services/${id}`, {
        nombre: editNombre,
        duracionMin: Number(editDuracion),
        precio: Number(editPrecio),
      });
      setEditId(null);
      toast.success("Cambios guardados.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo guardar el cambio."));
    }
  }

  // El empleado ve los servicios (los necesita para agendar) pero no los modifica.
  const dueno = esDueno();

  const botonNuevo = dueno && (
    <Button onClick={() => setMostrarForm(true)}>
      <PlusIcon />
      Nuevo servicio
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Servicios"
        description={
          dueno
            ? "Lo que ofrece tu negocio, con su duración y precio. La duración define cuánto bloquea cada cita."
            : "Lo que ofrece el negocio, con su duración y precio. Solo el dueño puede modificarlos."
        }
        action={!mostrarForm && botonNuevo}
      />

      {mostrarForm && (
        <Card className="mb-6 animate-aparecer">
          <form onSubmit={handleSubmit} className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-fg">Nuevo servicio</h2>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]">
              <Field label="Nombre">
                {(id) => (
                  <Input
                    id={id}
                    placeholder="Corte de cabello"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    autoFocus
                    required
                  />
                )}
              </Field>
              <Field label="Duración (min)">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    placeholder="30"
                    value={duracionMin}
                    onChange={(e) => setDuracionMin(e.target.value)}
                    required
                  />
                )}
              </Field>
              <Field label="Precio (MXN)">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="150"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    required
                  />
                )}
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar servicio</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {cargando ? (
          <EsqueletoLista etiqueta="Cargando servicios" avatar={false} />
        ) : errorCarga ? (
          <ErrorState message={errorCarga} onRetry={load} />
        ) : services.length === 0 ? (
          <EmptyState
            icon={<TagIcon className="size-5" />}
            title="Aún no hay servicios"
            description={
              dueno ? "Agrega el primero para poder agendar citas con él." : "El dueño todavía no ha dado de alta servicios."
            }
            action={!mostrarForm && botonNuevo}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th align="right" className="w-32">Duración</Th>
                <Th align="right" className="w-36">Precio</Th>
                {dueno && (
                  <Th align="right" className="w-44">
                    <span className="sr-only">Acciones</span>
                  </Th>
                )}
              </tr>
            </thead>
            <tbody>
              {services.map((s) =>
                editId === s.id ? (
                  <Tr key={s.id} className="bg-teal-50/50 hover:bg-teal-50/50">
                    <Td label="Nombre">
                      <Input
                        aria-label="Nombre"
                        className="h-9"
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        autoFocus
                      />
                    </Td>
                    <Td align="right" label="Duración (min)">
                      <Input
                        aria-label="Duración en minutos"
                        className="h-9 text-right"
                        type="number"
                        value={editDuracion}
                        onChange={(e) => setEditDuracion(e.target.value)}
                      />
                    </Td>
                    <Td align="right" label="Precio">
                      <Input
                        aria-label="Precio"
                        className="h-9 text-right"
                        type="number"
                        value={editPrecio}
                        onChange={(e) => setEditPrecio(e.target.value)}
                      />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(s.id)}>
                          Guardar
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ) : (
                  <Tr key={s.id}>
                    <Td className="font-medium text-fg max-md:pb-2 max-md:text-base">{s.nombre}</Td>
                    <Td align="right" label="Duración" className="text-muted tabular-nums">
                      {s.duracionMin} min
                    </Td>
                    <Td align="right" label="Precio" className="font-medium text-fg tabular-nums">
                      {formatPrecio(s.precio)}
                    </Td>
                    {dueno && (
                      <Td align="right">
                        <div className="flex justify-end gap-4">
                          <Button variant="link" onClick={() => startEdit(s)}>
                            Editar
                          </Button>
                          <Button variant="link-danger" onClick={() => handleDelete(s.id)}>
                            Eliminar
                          </Button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ),
              )}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
