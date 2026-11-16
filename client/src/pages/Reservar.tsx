import { useEffect, useId, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import mark from "../assets/citaflow-mark.svg";
import Button from "../components/ui/Button";
import { Esqueleto } from "../components/ui/Esqueleto";
import { Field, Input } from "../components/ui/Field";
import { CheckIcon } from "../components/ui/Icons";
import { Card } from "../components/ui/Table";
import { apiError } from "../components/ui/useToast";
import { formatPrecio } from "../lib/format";
import type { HorarioDia } from "../lib/horario";

// Página pública de reservas (/reservar/<slug>): el cliente final pide una cita sin tener
// cuenta. Todo sale de la API pública (/public/<slug>), que solo da lo necesario: servicios,
// nombre de pila del personal y horas libres. Las horas se muestran en la zona horaria del
// negocio, esté donde esté quien reserva. La cita entra "pendiente": el negocio la confirma.

interface Servicio {
  id: string;
  nombre: string;
  duracionMin: number;
  precio: string;
}

interface Negocio {
  nombre: string;
  recibeReservas: boolean;
  // Lo demás solo viene si el negocio recibe reservas.
  zonaHoraria?: string;
  diasAdelante?: number;
  horario?: HorarioDia[];
  servicios?: Servicio[];
  // Vacío si el negocio tiene una sola persona: no hay a quién elegir.
  personal?: { id: string; nombre: string }[];
}

interface Confirmacion {
  negocio: string;
  servicio: string;
  fechaHora: string;
  atiende: string | null;
}

// "AAAA-MM-DD" de un instante en una zona, y esa fecha más N días.
function fechaEn(zona: string, instante = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(instante);
}
function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const fechaLarga = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
function textoFecha(fecha: string) {
  return fechaLarga.format(new Date(`${fecha}T00:00:00Z`));
}
function textoHora(iso: string, zona: string) {
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: zona }).format(new Date(iso));
}

const chip = (elegido: boolean) =>
  `rounded-md border px-3 py-2 text-sm transition-colors ${
    elegido
      ? "border-teal-700 bg-teal-700 font-medium text-white"
      : "border-line-strong bg-surface text-fg hover:border-teal-500 hover:bg-teal-50"
  }`;

export default function Reservar() {
  const { slug } = useParams();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [atiendeId, setAtiendeId] = useState(""); // "" = sin preferencia
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState(""); // instante ISO elegido
  const [huecos, setHuecos] = useState<string[] | null>(null);
  // Subirlo vuelve a pedir las horas (cuando alguien más ganó la que se había elegido).
  const [version, setVersion] = useState(0);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  const idFecha = useId();
  const idHoras = useId();

  useEffect(() => {
    api
      .get(`/public/${slug}`)
      .then((res) => {
        setNegocio(res.data);
        document.title = `Reservar · ${res.data.nombre}`;
      })
      .catch((err) =>
        setErrorCarga(
          err.response?.status === 404
            ? "No encontramos este negocio. Revisa que el enlace esté completo."
            : apiError(err, "No se pudo cargar la página. Intenta de nuevo."),
        ),
      );
  }, [slug]);

  // Horas libres del día elegido: se piden al cambiar servicio, persona o fecha.
  useEffect(() => {
    if (!serviceId || !fecha) return;
    let vigente = true;
    api
      .get(`/public/${slug}/huecos`, { params: { serviceId, fecha, atiendeId: atiendeId || undefined } })
      .then((res) => vigente && setHuecos(res.data.huecos))
      .catch((err) => vigente && setError(apiError(err, "No se pudieron cargar las horas.")));
    return () => {
      vigente = false;
    };
  }, [slug, serviceId, atiendeId, fecha, version]);

  // Cambiar servicio, persona o fecha invalida la hora elegida y las horas que se veían.
  function elegir(cambio: () => void) {
    cambio();
    setHora("");
    setHuecos(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{10}$/.test(telefono)) {
      setError("El teléfono debe tener 10 dígitos.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await api.post(`/public/${slug}/reservas`, {
        serviceId,
        atiendeId: atiendeId || undefined,
        fechaHora: hora,
        nombre,
        telefono,
        email: email.trim() || undefined,
      });
      setConfirmacion(res.data);
    } catch (err) {
      setError(apiError(err, "No se pudo hacer la reserva. Intenta de nuevo."));
      // 409 = alguien más ganó esa hora (o ya no se puede): se vuelven a pedir las libres.
      if ((err as { response?: { status?: number } }).response?.status === 409) {
        setHora("");
        setHuecos(null);
        setVersion((v) => v + 1);
      }
    } finally {
      setEnviando(false);
    }
  }

  function otraReserva() {
    setConfirmacion(null);
    setHora("");
    setHuecos(null);
    setFecha("");
    setVersion((v) => v + 1);
  }

  const zona = negocio?.zonaHoraria ?? "America/Tijuana";
  const hoy = fechaEn(zona);
  const servicio = negocio?.servicios?.find((s) => s.id === serviceId);
  const personal = negocio?.personal ?? [];
  const cerrado =
    fecha !== "" && !(negocio?.horario ?? []).some((d) => d.diaSemana === new Date(`${fecha}T00:00:00Z`).getUTCDay());
  const otraZona = Intl.DateTimeFormat().resolvedOptions().timeZone !== zona;

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8 sm:py-12">
      <main className="mx-auto max-w-xl">
        <header className="mb-6 flex items-center gap-3">
          <img src={mark} alt="" className="size-10 rounded-lg ring-1 ring-line" />
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Reserva tu cita</p>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-fg">
              {negocio?.nombre ?? (errorCarga ? "CitaFlow" : "Cargando…")}
            </h1>
          </div>
        </header>

        {errorCarga ? (
          <Card className="p-6">
            <p role="alert" className="text-sm text-fg">
              {errorCarga}
            </p>
          </Card>
        ) : !negocio ? (
          <Card className="space-y-4 p-6">
            <div role="status" aria-label="Cargando" className="space-y-4">
              <Esqueleto className="h-4 w-40" />
              <Esqueleto className="h-12 w-full" />
              <Esqueleto className="h-12 w-full" />
            </div>
          </Card>
        ) : !negocio.recibeReservas ? (
          <Card className="p-6">
            <p role="status" className="text-sm text-fg">
              Este negocio aún no recibe reservas en línea.
            </p>
            <p className="mt-1 text-sm text-muted">Comunícate directamente con {negocio.nombre} para agendar tu cita.</p>
          </Card>
        ) : confirmacion ? (
          <Card className="animate-aparecer p-6 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <CheckIcon className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-fg">¡Listo! Tu cita quedó registrada</h2>
            <p className="mt-2 text-sm text-fg">
              <span className="font-medium">{confirmacion.servicio}</span> en {confirmacion.negocio}
              {confirmacion.atiende && <> con {confirmacion.atiende}</>}
            </p>
            <p className="mt-1 text-base font-semibold text-fg first-letter:uppercase">
              {textoFecha(fechaEn(zona, new Date(confirmacion.fechaHora)))}, {textoHora(confirmacion.fechaHora, zona)}
            </p>
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Tu cita está <span className="font-medium">pendiente</span>: el negocio la confirmará contigo.
            </p>
            <Button variant="secondary" className="mt-5" onClick={otraReserva}>
              Hacer otra reserva
            </Button>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-fg">1. ¿Qué servicio quieres?</h2>
              <div role="radiogroup" aria-label="Servicio" className="space-y-2">
                {negocio.servicios?.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === serviceId}
                    onClick={() => elegir(() => setServiceId(s.id))}
                    className={`flex w-full items-center justify-between gap-3 text-left ${chip(s.id === serviceId)}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{s.nombre}</span>
                      <span className={`block text-xs ${s.id === serviceId ? "text-white/80" : "text-muted"}`}>
                        {s.duracionMin} min
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatPrecio(s.precio)}</span>
                  </button>
                ))}
              </div>
            </Card>

            {servicio && personal.length > 0 && (
              <Card className="animate-aparecer p-5">
                <h2 className="mb-3 text-sm font-semibold text-fg">2. ¿Con quién?</h2>
                <div role="radiogroup" aria-label="Con quién" className="flex flex-wrap gap-2">
                  {[{ id: "", nombre: "Sin preferencia" }, ...personal].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={p.id === atiendeId}
                      onClick={() => elegir(() => setAtiendeId(p.id))}
                      className={chip(p.id === atiendeId)}
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {servicio && (
              <Card className="animate-aparecer p-5">
                <h2 className="mb-3 text-sm font-semibold text-fg">{personal.length > 0 ? "3" : "2"}. ¿Cuándo?</h2>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={idFecha} className="text-sm font-medium text-fg">
                    Día
                  </label>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Input
                      id={idFecha}
                      type="date"
                      lang="es-MX"
                      className="sm:w-56"
                      min={hoy}
                      max={sumarDias(hoy, negocio.diasAdelante ?? 30)}
                      value={fecha}
                      onChange={(e) => elegir(() => setFecha(e.target.value))}
                      required
                    />
                    {fecha && <span className="text-sm text-muted first-letter:uppercase">{textoFecha(fecha)}</span>}
                  </div>
                </div>

                {fecha && (
                  <div className="mt-4 flex flex-col gap-1.5">
                    <span id={idHoras} className="text-sm font-medium text-fg">
                      Hora
                      {otraZona && <span className="font-normal text-muted"> · hora del negocio ({zona})</span>}
                    </span>
                    {cerrado ? (
                      <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        El negocio está cerrado ese día. Elige otro.
                      </p>
                    ) : huecos === null ? (
                      <div role="status" aria-label="Cargando horas" className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {Array.from({ length: 8 }, (_, i) => (
                          <Esqueleto key={i} className="h-9" />
                        ))}
                      </div>
                    ) : huecos.length === 0 ? (
                      <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Ya no quedan horas libres ese día. Prueba con otro.
                      </p>
                    ) : (
                      <div role="radiogroup" aria-labelledby={idHoras} className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {huecos.map((h) => (
                          <button
                            key={h}
                            type="button"
                            role="radio"
                            aria-checked={h === hora}
                            onClick={() => setHora(h)}
                            className={`tabular-nums ${chip(h === hora)}`}
                          >
                            {textoHora(h, zona)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {servicio && hora && (
              <Card className="animate-aparecer p-5">
                <h2 className="mb-3 text-sm font-semibold text-fg">{personal.length > 0 ? "4" : "3"}. Tus datos</h2>
                <div className="space-y-4">
                  <Field label="Tu nombre">
                    {(id) => (
                      <Input
                        id={id}
                        autoComplete="name"
                        maxLength={100}
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        required
                      />
                    )}
                  </Field>
                  <Field label="Teléfono" hint="10 dígitos. El negocio lo usa para confirmar tu cita.">
                    {(id) => (
                      <Input
                        id={id}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        className="tabular-nums"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        required
                      />
                    )}
                  </Field>
                  <Field label="Email (opcional)">
                    {(id) => (
                      <Input
                        id={id}
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              </Card>
            )}

            {error && (
              <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            {servicio && hora && (
              <>
                <p className="text-center text-sm text-muted">
                  {servicio.nombre} ·{" "}
                  <span className="font-medium text-fg">
                    {textoFecha(fecha)}, {textoHora(hora, zona)}
                  </span>
                </p>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? "Reservando…" : "Confirmar reserva"}
                </Button>
              </>
            )}
          </form>
        )}

        <p className="mt-8 text-center text-xs text-faint">Reservas con CitaFlow</p>
      </main>
    </div>
  );
}
