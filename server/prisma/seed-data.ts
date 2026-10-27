// Negocios y cuentas de prueba de cada entorno. Lo usan el seed (prisma/seed.ts)
// y el script de pruebas (scripts/pruebas.sh). Solo datos: importarlo no toca la BD.

export interface Dataset {
  tenants: {
    nombre: string;
    email: string;
    password: string;
    nombreUsuario: string;
    servicios: { nombre: string; duracionMin: number; precio: number }[];
    clientes: { nombre: string; telefono: string }[];
  }[];
}

export const DATASETS: Record<string, Dataset> = {
  dev: {
    tenants: [
      {
        nombre: "Taller El Tornillo",
        email: "admin@tornillo.dev",
        password: "12345678",
        nombreUsuario: "Dev Tester",
        servicios: [
          { nombre: "Afinación básica", duracionMin: 30, precio: 150 },
          { nombre: "Cambio de aceite", duracionMin: 20, precio: 100 },
        ],
        clientes: [
          { nombre: "Cliente Prueba Uno", telefono: "6640000001" },
          { nombre: "Cliente Prueba Dos", telefono: "6640000002" },
        ],
      },
      {
        nombre: "Consultorio Dr. Prueba",
        email: "admin@drprueba.dev",
        password: "12345678",
        nombreUsuario: "Dev Tester 2",
        servicios: [{ nombre: "Consulta general", duracionMin: 30, precio: 200 }],
        clientes: [{ nombre: "Paciente Prueba", telefono: "6640000003" }],
      },
    ],
  },
  staging: {
    tenants: [
      {
        nombre: "Salón Bella Vista",
        email: "admin@bellavista.test",
        password: "12345678",
        nombreUsuario: "Staging Tester",
        servicios: [
          { nombre: "Corte de dama", duracionMin: 45, precio: 250 },
          { nombre: "Manicure", duracionMin: 30, precio: 180 },
        ],
        clientes: [
          { nombre: "Laura Staging", telefono: "6641110001" },
          { nombre: "Carlos Staging", telefono: "6641110002" },
        ],
      },
      {
        nombre: "MotorPro Servicio",
        email: "admin@motorpro.test",
        password: "12345678",
        nombreUsuario: "Staging Tester 2",
        servicios: [{ nombre: "Diagnóstico", duracionMin: 40, precio: 300 }],
        clientes: [{ nombre: "Cliente MotorPro", telefono: "6641110003" }],
      },
    ],
  },
  prod: {
    tenants: [
      {
        nombre: "Barbería El Corte",
        email: "admin@barberia.com",
        password: "12345678",
        nombreUsuario: "Juan Pérez",
        servicios: [
          { nombre: "Corte de cabello", duracionMin: 30, precio: 150 },
          { nombre: "Arreglo de barba", duracionMin: 20, precio: 100 },
          { nombre: "Corte + barba", duracionMin: 45, precio: 220 },
        ],
        clientes: [
          { nombre: "Pedro Pérez", telefono: "6641234567" },
          { nombre: "Luis Gómez", telefono: "6641234568" },
          { nombre: "Marco Sánchez", telefono: "6641234569" },
        ],
      },
      {
        nombre: "Spa Relax",
        email: "admin@sparelax.com",
        password: "12345678",
        nombreUsuario: "María López",
        servicios: [
          { nombre: "Masaje relajante", duracionMin: 60, precio: 500 },
          { nombre: "Facial hidratante", duracionMin: 45, precio: 400 },
        ],
        clientes: [
          { nombre: "Ana Torres", telefono: "6647654321" },
          { nombre: "Sofía Ramírez", telefono: "6647654322" },
        ],
      },
    ],
  },
};
