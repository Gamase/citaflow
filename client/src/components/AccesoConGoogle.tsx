import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { saveSession, type Session } from "../lib/session";
import Button from "./ui/Button";
import { Field, Input } from "./ui/Field";
import { apiError, useToast } from "./ui/useToast";

// "Continuar con Google" (Google Identity Services). Sin VITE_GOOGLE_CLIENT_ID no se muestra
// nada y la página queda igual. Google le da al front un ID token ("credential") y el backend
// es quien lo verifica: aquí solo se pasa tal cual.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Lo mínimo del script de Google que se usa (sin instalar tipos).
interface GoogleId {
  initialize(opciones: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(
    el: HTMLElement,
    opciones: { theme: string; size: string; text: string; width: number; locale: string },
  ): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

// El script se carga una sola vez, y solo en las páginas que muestran el botón.
let cargando: Promise<void> | null = null;
function cargarScript(): Promise<void> {
  cargando ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      cargando = null;
      reject(new Error("No cargó el script de Google"));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

type RespuestaSesion = Partial<Session> & { token: string };

interface Pendiente {
  credential: string;
  nombre: string;
  email: string;
}

// Envuelve el formulario de Login o Registro: arriba el botón de Google, y si ese correo no
// tiene cuenta, en lugar del formulario pide el nombre del negocio.
export default function AccesoConGoogle({ children }: { children: React.ReactNode }) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  function entrar(data: RespuestaSesion) {
    localStorage.setItem("token", data.token);
    saveSession(data);
    navigate("/dashboard");
  }

  async function conCredencial(credential: string) {
    try {
      const res = await api.post("/auth/google", { credential });
      if (res.data.necesitaRegistro) {
        setPendiente({ credential, nombre: res.data.nombre, email: res.data.email });
      } else {
        entrar(res.data);
      }
    } catch (err) {
      toast.error(apiError(err, "No se pudo iniciar sesión con Google."));
    }
  }

  if (!CLIENT_ID) return <>{children}</>;

  if (pendiente) {
    return <NombreNegocio pendiente={pendiente} onCancelar={() => setPendiente(null)} onListo={entrar} />;
  }

  return (
    <>
      <BotonGoogle clientId={CLIENT_ID} onCredencial={conCredencial} />
      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />o con tu correo<span className="h-px flex-1 bg-line" />
      </div>
      {children}
    </>
  );
}

function BotonGoogle({ clientId, onCredencial }: { clientId: string; onCredencial: (c: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [fallo, setFallo] = useState(false);
  // Google guarda el callback al inicializar; con el ref siempre llama a la versión actual.
  const alRecibir = useRef(onCredencial);
  useEffect(() => {
    alRecibir.current = onCredencial;
  });

  useEffect(() => {
    let vigente = true;
    cargarScript()
      .then(() => {
        const el = caja.current;
        if (!vigente || !el || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => alRecibir.current(r.credential),
        });
        window.google.accounts.id.renderButton(el, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          // Google pide el ancho en px (máximo 400).
          width: Math.min(400, Math.max(200, el.offsetWidth)),
          locale: "es",
        });
      })
      .catch(() => vigente && setFallo(true));
    return () => {
      vigente = false;
    };
  }, [clientId]);

  if (fallo) {
    return <p className="text-center text-sm text-muted">No se pudo cargar el botón de Google. Entra con tu correo.</p>;
  }
  return <div ref={caja} className="flex min-h-10 justify-center" />;
}

function NombreNegocio({
  pendiente,
  onCancelar,
  onListo,
}: {
  pendiente: Pendiente;
  onCancelar: () => void;
  onListo: (data: RespuestaSesion) => void;
}) {
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await api.post("/auth/google/registro", { credential: pendiente.credential, nombreNegocio });
      onListo(res.data);
    } catch (err) {
      toast.error(apiError(err, "No se pudo crear tu negocio."));
      // La credencial de Google vence (~1 h): si ya no sirve, se vuelve a empezar.
      if ((err as { response?: { status?: number } }).response?.status === 401) onCancelar();
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Ponle nombre a tu negocio</h2>
        <p className="mt-1 text-sm text-muted">
          {pendiente.email} aún no tiene cuenta en CitaFlow. Vas a crear un negocio nuevo y serás el dueño.
        </p>
      </div>
      <Field label="Nombre del negocio">
        {(id) => (
          <Input
            id={id}
            autoComplete="organization"
            placeholder="Barbería El Corte"
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
            autoFocus
            required
          />
        )}
      </Field>
      <p className="text-xs text-muted">
        ¿Trabajas en un negocio que ya usa CitaFlow? No crees uno: pídele al dueño que te dé de alta en Equipo.
      </p>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" disabled={enviando}>
          {enviando ? "Creando tu negocio…" : "Crear mi negocio"}
        </Button>
      </div>
    </form>
  );
}
