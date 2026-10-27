import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DashboardLayout from "./components/DashboardLayout";
import Services from "./pages/Services";
import Clients from "./pages/Clients";
import Appointments from "./pages/Appointments";
import { clearSession, LOGIN_EXPIRADA, tokenVigente } from "./lib/session";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/login" />;
  }
  if (!tokenVigente(token)) {
    clearSession();
    return <Navigate to={LOGIN_EXPIRADA} />;
  }
  return <>{children}</>;
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
          <Route index element={<Navigate to="services" />} />
          <Route path="services" element={<Services />} />
          <Route path="clients" element={<Clients />} />
          <Route path="appointments" element={<Appointments />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
