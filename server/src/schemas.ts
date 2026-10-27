import { z } from "zod";
import { EstadoCita } from "@prisma/client";

// Esquemas de entrada de cada ruta. El middleware `validar` los aplica antes del handler:
// si algo no cumple responde 400 con el mensaje; si cumple, la ruta recibe el body ya limpio
// (con trim, tipos correctos y sin campos extra como un tenantId colado).

const texto = (campo: string) =>
  z.string({ error: `${campo} es obligatorio` }).trim().min(1, `${campo} es obligatorio`);

const email = z
  .string({ error: "El email es obligatorio" })
  .trim()
  .pipe(z.email("El email no tiene un formato válido"));

const id = (campo: string) => z.uuid({ error: `Falta ${campo} o no es válido` });

// --- Auth ---

export const registroSchema = z.object({
  nombreNegocio: texto("El nombre del negocio"),
  nombreUsuario: texto("Tu nombre"),
  email,
  password: z
    .string({ error: "La contraseña es obligatoria" })
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const loginSchema = z.object({
  email: texto("El email"),
  password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria"),
});

// --- Services ---

export const servicioSchema = z.object({
  nombre: texto("El nombre del servicio"),
  duracionMin: z
    .number({ error: "La duración debe ser un número" })
    .int("La duración debe ser un número entero de minutos")
    .min(1, "La duración debe estar entre 1 y 1440 minutos")
    .max(1440, "La duración debe estar entre 1 y 1440 minutos"),
  precio: z.number({ error: "El precio debe ser un número" }).min(0, "El precio no puede ser negativo"),
});

export const editarServicioSchema = servicioSchema
  .partial()
  .refine((datos) => Object.keys(datos).length > 0, "No hay cambios que guardar");

// --- Clients ---

export const clienteSchema = z.object({
  nombre: texto("El nombre del cliente"),
  telefono: z
    .string({ error: "El teléfono debe tener 10 dígitos" })
    .trim()
    .regex(/^\d{10}$/, "El teléfono debe tener 10 dígitos"),
  email: email.optional(),
});

// Al editar, `email: null` borra el email que tenía.
export const editarClienteSchema = clienteSchema
  .extend({ email: email.nullable() })
  .partial()
  .refine((datos) => Object.keys(datos).length > 0, "No hay cambios que guardar");

// --- Appointments ---

export const citaSchema = z.object({
  clientId: id("el cliente"),
  serviceId: id("el servicio"),
  fechaHora: z
    .string({ error: "La fecha y hora es obligatoria" })
    .pipe(z.coerce.date({ error: "La fecha y hora no es válida" })),
});

// Reagendar solo mueve la fecha: cambiar de servicio es cancelar y agendar otra.
export const reagendarSchema = citaSchema.pick({ fechaHora: true });

export const estadoSchema = z.object({
  estado: z.enum(EstadoCita, { error: "Estado no válido" }),
});

export type RegistroInput = z.infer<typeof registroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ServicioInput = z.infer<typeof servicioSchema>;
export type EditarServicioInput = z.infer<typeof editarServicioSchema>;
export type ClienteInput = z.infer<typeof clienteSchema>;
export type EditarClienteInput = z.infer<typeof editarClienteSchema>;
export type CitaInput = z.infer<typeof citaSchema>;
export type ReagendarInput = z.infer<typeof reagendarSchema>;
export type EstadoInput = z.infer<typeof estadoSchema>;
