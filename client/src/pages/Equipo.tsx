import { useEffect, useState } from "react";
import api from "../api/client";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import ErrorState from "../components/ui/ErrorState";
import { Field, Input } from "../components/ui/Field";
import { PlusIcon } from "../components/ui/Icons";
import PageHeader from "../components/ui/PageHeader";
import { Card, Table, Td, Th, Tr } from "../components/ui/Table";
import { apiError, useToast } from "../components/ui/useToast";
import { getSession, type Rol } from "../lib/session";

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  // Citas próximas (Pendientes o Confirmadas) que atiende esta persona.
  _count: { citasQueAtiende: number };
}

// Lo que se está haciendo en una fila: editar sus datos, asignar contraseña nueva,
// o confirmar desactivar/reactivar. Una fila a la vez.
type Modo =
  | { id: string; tipo: "editar"; nombre: string; email: string }
  | { id: string; tipo: "password"; password: string }
  | { id: string; tipo: "activo" };

// Solo la ve el dueño (la ruta y el backend lo exigen).
export default function Equipo() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<Modo | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const toast = useToast();
  const miEmail = getSession()?.user.email;

  function load() {
    api
      .get("/users")
      .then((res) => {
        setUsuarios(res.data);
        setErrorCarga(null);
      })
      .catch((err) => setErrorCarga(apiError(err, "No se pudo cargar el equipo.")))
      .finally(() => setCargando(false));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/users", { nombre, email, password });
      setNombre("");
      setEmail("");
      setPassword("");
      setMostrarForm(false);
      toast.success("Empleado agregado. Compártele su correo y la contraseña temporal.");
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo agregar al empleado."));
    }
  }

  // Corre la petición de una fila, avisa y recarga. El error se queda en un toast
  // y la fila sigue abierta para corregir.
  async function enFila(id: string, peticion: () => Promise<unknown>, exito: string, fallo: string) {
    setCambiando(id);
    try {
      await peticion();
      setModo(null);
      toast.success(exito);
      load();
    } catch (err) {
      toast.error(apiError(err, fallo));
    } finally {
      setCambiando(null);
    }
  }

  // El dueño responde por los correos de su equipo: primero verifica el suyo (el backend lo exige).
  const verificado = getSession()?.user.verificado !== false;

  const botonNuevo = (
    <Button
      onClick={() => setMostrarForm(true)}
      disabled={!verificado}
      title={verificado ? undefined : "Verifica tu correo para dar de alta empleados"}
    >
      <PlusIcon />
      Nuevo empleado
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Quién entra a CitaFlow por tu negocio. Los empleados agendan y atienden citas, pero no ven ingresos ni cambian servicios."
        action={!mostrarForm && botonNuevo}
      />

      {mostrarForm && (
        <Card className="mb-6">
          <form onSubmit={handleSubmit} className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-fg">Nuevo empleado</h2>
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
              <Field label="Email" hint="Con este correo inicia sesión.">
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                )}
              </Field>
              <Field label="Contraseña temporal" hint="Mínimo 8 caracteres.">
                {(id) => (
                  <Input
                    id={id}
                    type="text"
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                )}
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar empleado</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {cargando ? (
          <p className="px-4 py-14 text-center text-sm text-muted">Cargando equipo…</p>
        ) : errorCarga ? (
          <ErrorState message={errorCarga} onRetry={load} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Email</Th>
                <Th className="w-28">Rol</Th>
                <Th className="w-28">Acceso</Th>
                <Th align="right">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const soyYo = u.email === miEmail;
                // Solo los empleados se administran aquí; los datos del dueño irán en Ajustes.
                const administrable = !soyYo && u.rol === "EMPLEADO";
                const m = modo?.id === u.id ? modo : null;
                const ocupado = cambiando === u.id;

                if (m?.tipo === "editar") {
                  return (
                    <Tr key={u.id} className="bg-teal-50/50 hover:bg-teal-50/50">
                      <Td>
                        <Input
                          aria-label="Nombre"
                          className="h-9"
                          value={m.nombre}
                          onChange={(e) => setModo({ ...m, nombre: e.target.value })}
                          autoFocus
                        />
                      </Td>
                      <Td>
                        <Input
                          aria-label="Email"
                          className="h-9"
                          type="email"
                          value={m.email}
                          onChange={(e) => setModo({ ...m, email: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <Badge tone="neutral">Empleado</Badge>
                      </Td>
                      <Td>
                        <Badge tone={u.activo ? "teal" : "danger"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setModo(null)}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            disabled={ocupado}
                            onClick={() =>
                              enFila(
                                u.id,
                                () => api.patch(`/users/${u.id}`, { nombre: m.nombre, email: m.email }),
                                "Cambios guardados.",
                                "No se pudo guardar el cambio.",
                              )
                            }
                          >
                            Guardar
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                }

                return (
                  <Tr key={u.id} className={u.activo ? "" : "text-faint"}>
                    <Td className={`font-medium ${u.activo ? "text-fg" : "text-muted"}`}>
                      {u.nombre}
                      {soyYo && <span className="ml-1.5 text-xs font-normal text-muted">(tú)</span>}
                    </Td>
                    <Td className={u.activo ? "text-muted" : "text-faint"}>{u.email}</Td>
                    <Td>
                      <Badge tone={u.rol === "DUENO" ? "ink" : "neutral"}>
                        {u.rol === "DUENO" ? "Dueño" : "Empleado"}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={u.activo ? "teal" : "danger"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
                    </Td>
                    <Td align="right">
                      {!administrable ? null : m?.tipo === "password" ? (
                        <form
                          className="flex flex-wrap items-center justify-end gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            enFila(
                              u.id,
                              () => api.patch(`/users/${u.id}/password`, { password: m.password }),
                              `Contraseña restablecida. Compártesela a ${u.nombre}.`,
                              "No se pudo restablecer la contraseña.",
                            );
                          }}
                        >
                          <Input
                            aria-label="Contraseña temporal nueva (mínimo 8 caracteres)"
                            placeholder="Contraseña temporal nueva"
                            className="h-9 w-56"
                            type="text"
                            autoComplete="new-password"
                            minLength={8}
                            required
                            value={m.password}
                            onChange={(e) => setModo({ ...m, password: e.target.value })}
                            autoFocus
                          />
                          <Button size="sm" variant="secondary" onClick={() => setModo(null)}>
                            Cancelar
                          </Button>
                          <Button size="sm" type="submit" disabled={ocupado}>
                            Sí, restablecer
                          </Button>
                        </form>
                      ) : m?.tipo === "activo" ? (
                        <div className="flex items-center justify-end gap-3">
                          <span className="text-sm text-fg">
                            {!u.activo
                              ? "¿Devolverle el acceso?"
                              : u._count.citasQueAtiende > 0
                                ? `Tiene ${u._count.citasQueAtiende} ${u._count.citasQueAtiende === 1 ? "cita próxima; seguirá" : "citas próximas; seguirán"} a su nombre hasta que las reasignes. ¿Quitarle el acceso?`
                                : "¿Quitarle el acceso?"}
                          </span>
                          <Button size="sm" variant="secondary" onClick={() => setModo(null)} autoFocus>
                            No
                          </Button>
                          <Button
                            size="sm"
                            variant={u.activo ? "danger" : "primary"}
                            disabled={ocupado}
                            onClick={() =>
                              enFila(
                                u.id,
                                () => api.patch(`/users/${u.id}/activo`, { activo: !u.activo }),
                                u.activo ? `${u.nombre} ya no tiene acceso.` : `${u.nombre} vuelve a tener acceso.`,
                                "No se pudo cambiar el acceso.",
                              )
                            }
                          >
                            {u.activo ? "Sí, desactivar" : "Sí, reactivar"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-4">
                          <Button
                            variant="link"
                            disabled={ocupado}
                            onClick={() => setModo({ id: u.id, tipo: "editar", nombre: u.nombre, email: u.email })}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="link-muted"
                            disabled={ocupado}
                            onClick={() => setModo({ id: u.id, tipo: "password", password: "" })}
                          >
                            Restablecer contraseña
                          </Button>
                          <Button
                            variant={u.activo ? "link-danger" : "link"}
                            disabled={ocupado}
                            onClick={() => setModo({ id: u.id, tipo: "activo" })}
                          >
                            {u.activo ? "Desactivar" : "Reactivar"}
                          </Button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
