import { useEffect, useState } from "react";
import api from "../api/client";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import { Field, Input } from "../components/ui/Field";
import { PlusIcon, UsersIcon } from "../components/ui/Icons";
import PageHeader from "../components/ui/PageHeader";
import { Card, Table, Td, Th, Tr } from "../components/ui/Table";
import { apiError, useToast } from "../components/ui/useToast";
import { formatTelefono } from "../lib/format";

interface Client {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const toast = useToast();

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editEmail, setEditEmail] = useState("");

  function load() {
    api
      .get("/clients")
      .then((res) => {
        setClients(res.data);
        setErrorCarga(null);
      })
      .catch((err) => setErrorCarga(apiError(err, "No se pudieron cargar los clientes.")))
      .finally(() => setCargando(false));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!/^\d{10}$/.test(telefono)) {
      toast.error("El teléfono debe tener 10 dígitos.");
      return;
    }

    try {
      await api.post("/clients", { nombre, telefono, email: email || undefined });
      setNombre("");
      setTelefono("");
      setEmail("");
      setMostrarForm(false);
      toast.success("Cliente agregado.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo agregar el cliente."));
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/clients/${id}`);
      toast.success("Cliente eliminado.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo eliminar el cliente."));
    }
  }

  function startEdit(c: Client) {
    setEditId(c.id);
    setEditNombre(c.nombre);
    setEditTelefono(c.telefono);
    setEditEmail(c.email ?? "");
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit(id: string) {
    if (!/^\d{10}$/.test(editTelefono)) {
      toast.error("El teléfono debe tener 10 dígitos.");
      return;
    }

    try {
      // Email vacío = quitarlo (el backend lo guarda como null).
      await api.patch(`/clients/${id}`, {
        nombre: editNombre,
        telefono: editTelefono,
        email: editEmail.trim() || null,
      });
      setEditId(null);
      toast.success("Cambios guardados.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo guardar el cambio."));
    }
  }

  const botonNuevo = (
    <Button onClick={() => setMostrarForm(true)}>
      <PlusIcon />
      Nuevo cliente
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Las personas que atiende tu negocio. El teléfono identifica a cada cliente."
        action={!mostrarForm && botonNuevo}
      />

      {mostrarForm && (
        <Card className="mb-6">
          <form onSubmit={handleSubmit} className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-fg">Nuevo cliente</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre">
                {(id) => (
                  <Input
                    id={id}
                    autoComplete="off"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    autoFocus
                    required
                  />
                )}
              </Field>
              <Field label="Teléfono" hint="10 dígitos, sin espacios.">
                {(id) => (
                  <Input
                    id={id}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="5512345678"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    required
                  />
                )}
              </Field>
              <Field label="Email" hint="Opcional.">
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar cliente</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {cargando ? (
          <p className="px-4 py-14 text-center text-sm text-muted">Cargando clientes…</p>
        ) : errorCarga ? (
          <ErrorState message={errorCarga} onRetry={load} />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title="Aún no hay clientes"
            description="Agrega el primero para poder agendarle citas."
            action={!mostrarForm && botonNuevo}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th className="w-40">Teléfono</Th>
                <Th>Email</Th>
                <Th align="right" className="w-44">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) =>
                editId === c.id ? (
                  <Tr key={c.id} className="bg-teal-50/50 hover:bg-teal-50/50">
                    <Td>
                      <Input
                        aria-label="Nombre"
                        className="h-9"
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        autoFocus
                      />
                    </Td>
                    <Td>
                      <Input
                        aria-label="Teléfono (10 dígitos)"
                        className="h-9 tabular-nums"
                        type="tel"
                        inputMode="numeric"
                        value={editTelefono}
                        onChange={(e) => setEditTelefono(e.target.value)}
                      />
                    </Td>
                    <Td>
                      <Input
                        aria-label="Email (opcional)"
                        className="h-9"
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                      />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(c.id)}>
                          Guardar
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ) : (
                  <Tr key={c.id}>
                    <Td className="font-medium text-fg">{c.nombre}</Td>
                    <Td className="text-muted tabular-nums">{formatTelefono(c.telefono)}</Td>
                    <Td className="text-muted">{c.email ?? <span className="text-faint">—</span>}</Td>
                    <Td align="right">
                      <div className="flex justify-end gap-4">
                        <Button variant="link" onClick={() => startEdit(c)}>
                          Editar
                        </Button>
                        <Button variant="link-danger" onClick={() => handleDelete(c.id)}>
                          Eliminar
                        </Button>
                      </div>
                    </Td>
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
