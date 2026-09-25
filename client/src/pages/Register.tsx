import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";

export default function Register() {
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/auth/register", {
        nombreNegocio,
        nombreUsuario,
        email,
        password,
      });
      localStorage.setItem("token", res.data.token);
      navigate("/dashboard");
    } catch {
      setError("No se pudo registrar. Revisa los datos.");
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="w-80 space-y-3 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-bold">Registra tu negocio</h1>
        <input
          className="w-full rounded border p-2"
          placeholder="Nombre del negocio"
          value={nombreNegocio}
          onChange={(e) => setNombreNegocio(e.target.value)}
          required
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Tu nombre"
          value={nombreUsuario}
          onChange={(e) => setNombreUsuario(e.target.value)}
          required
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-blue-600 p-2 text-white" type="submit">
          Registrar
        </button>
        <p className="text-sm">
          ¿Ya tienes cuenta? <Link className="text-blue-600" to="/login">Inicia sesión</Link>
        </p>
      </form>
    </div>
  );
}
