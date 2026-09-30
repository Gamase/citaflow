import logo from "../assets/citaflow-logo.svg";
import logoDark from "../assets/citaflow-logo-dark.svg";
import { CheckIcon } from "./ui/Icons";

const puntos = [
  "Agenda sin empalmes: el sistema bloquea horarios que chocan.",
  "Clientes y servicios de tu negocio, siempre a la mano.",
  "Cada negocio ve solo sus propios datos.",
];

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-teal-500/10 blur-3xl"
        />
        <img src={logoDark} alt="CitaFlow" className="h-10 w-auto self-start" />

        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Agenda, clientes y servicios de tu negocio en un solo lugar.
          </h2>
          <p className="mt-4 text-ink-300">
            CitaFlow ayuda a barberías, spas, salones y talleres a organizar sus citas sin hojas de
            cálculo ni mensajes perdidos.
          </p>
          <ul className="mt-8 space-y-3">
            {puntos.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-500">
                  <CheckIcon className="size-3.5" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ink-300">© {new Date().getFullYear()} CitaFlow</p>
      </aside>

      <main className="flex items-center justify-center bg-surface px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <img src={logo} alt="CitaFlow" className="mb-10 h-9 w-auto lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}
