import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import logoDark from "../assets/citaflow-logo-dark.svg";
import mark from "../assets/citaflow-mark.svg";
import api from "../api/client";
import { clearSession, esDueno, getSession, saveSession, type ContextoSesion } from "../lib/session";
import Button from "./ui/Button";
import { apiError, useToast } from "./ui/useToast";
import { BadgeIcon, CalendarIcon, ChartIcon, GearIcon, LogOutIcon, MenuIcon, TagIcon, UsersIcon, XIcon } from "./ui/Icons";

// `end` en Resumen: si no, /dashboard quedaría activo también en /dashboard/clients, etc.
const navItems = [
  { to: "/dashboard", label: "Resumen", icon: ChartIcon, end: true },
  { to: "/dashboard/services", label: "Servicios", icon: TagIcon },
  { to: "/dashboard/clients", label: "Clientes", icon: UsersIcon },
  { to: "/dashboard/appointments", label: "Citas", icon: CalendarIcon },
  { to: "/dashboard/team", label: "Equipo", icon: BadgeIcon, soloDueno: true },
];

// Estilo de un link del sidebar activo o no. Lo comparten el menú y la tarjeta del negocio
// (que lleva a Ajustes). La barra de acento a la izquierda va en el `before:`.
function claseLink(isActive: boolean) {
  return isActive
    ? "bg-teal-500/15 text-teal-300 before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-teal-500"
    : "text-ink-300 hover:bg-white/10 hover:text-white";
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  // En estado (no solo en localStorage) para que un cambio desde Ajustes se vea aquí al momento.
  const [session, setSession] = useState(getSession);

  const contexto: ContextoSesion = {
    actualizarSesion: (cambios) => {
      if (!session) return;
      const nueva = { user: { ...session.user, ...cambios.user }, tenant: { ...session.tenant, ...cambios.tenant } };
      saveSession(nueva);
      setSession(nueva);
    },
  };
  const negocio = session?.tenant.nombre ?? "Tu negocio";
  const sinVerificar = session?.user.verificado === false;
  const toast = useToast();
  const [reenviando, setReenviando] = useState(false);

  // Si verificó en otra pestaña o dispositivo, el aviso se quita sin volver a entrar.
  // (Solo al montar; después, Ajustes y /verificar actualizan la sesión ellos mismos.)
  useEffect(() => {
    if (getSession()?.user.verificado !== false) return;
    api
      .get("/me")
      .then((res) => {
        const actual = getSession();
        if (!res.data.emailVerificado || !actual) return;
        const nueva = { ...actual, user: { ...actual.user, verificado: true } };
        saveSession(nueva);
        setSession(nueva);
      })
      .catch(() => {});
  }, []);

  async function reenviar() {
    setReenviando(true);
    try {
      const res = await api.post("/me/reenviar-verificacion");
      toast.success(res.data.mensaje);
    } catch (err) {
      toast.error(apiError(err, "No se pudo reenviar el correo."));
    } finally {
      setReenviando(false);
    }
  }

  function logout() {
    clearSession();
    navigate("/login");
  }

  const sidebar = (
    // overflow-y-auto: en un celular acostado el menú no cabe a lo alto y se corta sin scroll.
    <div className="flex h-full flex-col overflow-y-auto bg-ink-900 text-white">
      <div className="flex h-20 items-center px-5">
        <img src={logoDark} alt="CitaFlow" className="h-10 w-auto" />
      </div>

      <nav aria-label="Principal" className="flex-1 space-y-1.5 px-3 py-4">
        {navItems.filter((item) => !item.soloDueno || esDueno()).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMenuAbierto(false)}
            className={({ isActive }) =>
              `relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors ${claseLink(isActive)}`
            }
          >
            <Icon className="size-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <p className="px-2 pb-2 text-[11px] font-medium tracking-wider text-ink-300 uppercase">
          Negocio conectado
        </p>
        {/* Toda la tarjeta lleva a Ajustes (tu cuenta y, si eres dueño, el negocio). */}
        <NavLink
          to="/dashboard/settings"
          aria-label="Ajustes de la cuenta"
          title="Ajustes de la cuenta"
          onClick={() => setMenuAbierto(false)}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-lg p-2.5 transition-colors ${
              isActive ? claseLink(true) : "bg-white/5 hover:bg-white/10"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-500 text-sm font-semibold text-ink-900"
              >
                {negocio.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{negocio}</p>
                {session && (
                  <p className="truncate text-xs text-ink-300">
                    {session.user.nombre} · {session.user.rol === "DUENO" ? "Dueño" : "Empleado"}
                  </p>
                )}
              </div>
              <GearIcon
                className={`size-5 shrink-0 transition-colors ${
                  isActive ? "text-teal-300" : "text-ink-300 group-hover:text-white"
                }`}
              />
            </>
          )}
        </NavLink>
        <button
          type="button"
          onClick={logout}
          className="mt-1.5 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-ink-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOutIcon className="size-5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Escritorio: sidebar fijo */}
      <aside className="hidden w-64 shrink-0 lg:fixed lg:inset-y-0 lg:block">{sidebar}</aside>

      {/* Móvil: barra superior + menú desplegable */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-ink-900 px-4 text-white lg:hidden">
        <img src={mark} alt="" className="size-7 rounded-md ring-1 ring-white/15" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{negocio}</p>
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          className="rounded-md p-2 text-ink-300 hover:bg-white/10 hover:text-white"
          aria-label="Abrir menú"
          aria-expanded={menuAbierto}
        >
          <MenuIcon className="size-5" />
        </button>
      </header>

      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMenuAbierto(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop">
            {sidebar}
            <button
              type="button"
              onClick={() => setMenuAbierto(false)}
              className="absolute top-4 right-3 rounded-md p-1.5 text-ink-300 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar menú"
            >
              <XIcon className="size-5" />
            </button>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 lg:pl-64">
        {sinVerificar && (
          <div role="status" className="border-b border-amber-500/30 bg-amber-50 px-4 py-3 sm:px-8">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 text-sm text-amber-800">
              <p className="min-w-0 flex-1">
                <span className="font-semibold">Verifica tu correo.</span> Te mandamos un enlace a{" "}
                <span className="font-medium break-all">{session?.user.email}</span>. Mientras tanto puedes usar
                CitaFlow, pero no dar de alta empleados ni cambiar tu email.
              </p>
              <Button size="sm" variant="secondary" disabled={reenviando} onClick={reenviar}>
                {reenviando ? "Enviando…" : "Reenviar correo"}
              </Button>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10 xl:px-12">
          <Outlet context={contexto} />
        </div>
      </main>
    </div>
  );
}
