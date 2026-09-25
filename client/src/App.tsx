import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("cargando...");

  useEffect(() => {
    fetch("http://localhost:3000/health")
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("error de conexión"));
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Backend dice: {status}</h1>
    </div>
  );
}

export default App;
