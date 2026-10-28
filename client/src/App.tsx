import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DashboardLayout from "./components/DashboardLayout";
import Services from "./pages/Services";
import Clients from "./pages/Clients";
import Appointments from "./pages/Appointments";
import Resumen from "./pages/Resumen";
import Equipo from "./pages/Equipo";
import { clearSession, esDueno, getSession, LOGIN_EXPIRADA, tokenVigente } from "./lib/session";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/login" />;
  }
  // Sin rol guardado = sesión de antes de que existieran los roles: se vuelve a entrar.
  if (!tokenVigente(token) || !getSession()?.user.rol) {
    clearSession();
    return <Navigate to={LOGIN_EXPIRADA} />;
  }
  return <>{children}</>;
}

// Páginas solo para el dueño. Es comodidad de la UI: el backend responde 403 de todos modos.
function SoloDueno({ children }: { children: React.ReactNode }) {
  return esDueno() ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Resumen />} />
          <Route path="services" element={<Services />} />
          <Route path="clients" element={<Clients />} />
          <Route path="appointments" element={<Appointments />} />
          <Route
            path="equipo"
            element={
              <SoloDueno>
                <Equipo />
              </SoloDueno>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
