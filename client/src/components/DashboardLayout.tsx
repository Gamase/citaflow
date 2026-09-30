import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import logoDark from "../assets/citaflow-logo-dark.svg";
import mark from "../assets/citaflow-mark.svg";
import { clearSession, getSession } from "../lib/session";
import { CalendarIcon, LogOutIcon, MenuIcon, TagIcon, UsersIcon, XIcon } from "./ui/Icons";

const navItems = [
  { to: "/dashboard/services", label: "Servicios", icon: TagIcon },
  { to: "/dashboard/clients", label: "Clientes", icon: UsersIcon },
  { to: "/dashboard/appointments", label: "Citas", icon: CalendarIcon },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const session = getSession();
  const negocio = session?.tenant.nombre ?? "Tu negocio";

  function logout() {
    clearSession();
    navigate("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 text-white">
      <div className="flex h-16 items-center px-5">
        <img src={logoDark} alt="CitaFlow" className="h-8 w-auto" />
      </div>

      <nav aria-label="Principal" className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMenuAbierto(false)}
            className={({ isActive }) =>
              `relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/10 text-white before:absolute before:inset-y-1.5 before:-left-3 before:w-1 before:rounded-r-full before:bg-teal-500"
                  : "text-ink-300 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <p className="px-2 pb-2 text-[11px] font-medium tracking-wider text-ink-300 uppercase">
          Negocio conectado
        </p>
        <div className="flex items-center gap-3 rounded-md bg-white/5 p-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-500 text-sm font-semibold text-ink-900"
          >
            {negocio.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white" title={negocio}>
              {negocio}
            </p>
            {session && (
              <p className="truncate text-xs text-ink-300" title={session.user.email}>
                {session.user.nombre} · {session.user.email}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-ink-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOutIcon className="size-4" />
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
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
