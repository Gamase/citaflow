import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface Service {
  id: string;
  nombre: string;
  duracionMin: number;
  precio: string;
}

export default function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/services").then((res) => setServices(res.data));
  }, []);

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis servicios</h1>
        <button onClick={logout} className="rounded bg-gray-200 px-3 py-1">
          Cerrar sesión
        </button>
      </div>
      <ul className="space-y-2">
        {services.map((s) => (
          <li key={s.id} className="rounded border p-3">
            {s.nombre} — {s.duracionMin} min — ${s.precio}
          </li>
        ))}
      </ul>
      {services.length === 0 && <p className="text-gray-500">No tienes servicios todavía.</p>}
    </div>
  );
}
