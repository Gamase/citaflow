import { useEffect, useState } from "react";
import api from "../api/client";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
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
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const toast = useToast();

  function load() {
    api
      .get("/clients")
      .then((res) => setClients(res.data))
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
                <Th align="right" className="w-28">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-fg">{c.nombre}</Td>
                  <Td className="text-muted tabular-nums">{formatTelefono(c.telefono)}</Td>
                  <Td className="text-muted">{c.email ?? <span className="text-faint">—</span>}</Td>
                  <Td align="right">
                    <Button variant="link-danger" onClick={() => handleDelete(c.id)}>
                      Eliminar
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
