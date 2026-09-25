import { NavLink, Outlet, useNavigate } from "react-router-dom";

const navItems = [
  { to: "/dashboard/services", label: "Servicios" },
  { to: "/dashboard/clients", label: "Clientes" },
  { to: "/dashboard/appointments", label: "Citas" },
];

export default function DashboardLayout() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 flex-col justify-between bg-[var(--color-ink)] p-6 text-white">
        <div>
          <h1 className="mb-8 font-[var(--font-display)] text-2xl font-semibold">
            CitaFlow
          </h1>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--color-teal)] text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <button
          onClick={logout}
          className="rounded-md px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white"
        >
          Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
