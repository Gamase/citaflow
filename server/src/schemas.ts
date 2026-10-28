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

// Para validar(…, "params") en rutas con /:id.
export const idParamSchema = z.object({ id: z.uuid({ error: "El id no es válido" }) });

// --- Auth ---

export const registroSchema = z.object({
  nombreNegocio: texto("El nombre del negocio"),
  nombreUsuario: texto("Tu nombre"),
  email,
  password: z
    .string({ error: "La contraseña es obligatoria" })
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
});

// Login con Google: el ID token que da Google Identity Services al front.
export const googleSchema = z.object({
  credential: z
    .string({ error: "Falta la credencial de Google" })
    .min(1, "Falta la credencial de Google")
    .max(4096, "La credencial de Google no es válida"),
});

// Registro con Google: la misma credencial (se vuelve a verificar) más el nombre del negocio.
export const googleRegistroSchema = googleSchema.extend({
  nombreNegocio: texto("El nombre del negocio"),
});

export const loginSchema = z.object({
  email: texto("El email"),
  password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria"),
});

// --- Correo: verificar y restablecer ---

const tokenCorreo = z
  .string({ error: "El enlace no es válido o ya venció" })
  .min(1, "El enlace no es válido o ya venció")
  .max(200, "El enlace no es válido o ya venció");

export const verificarCorreoSchema = z.object({ token: tokenCorreo });

export const olvideSchema = z.object({ email });

export const restablecerSchema = z.object({
  token: tokenCorreo,
  password: registroSchema.shape.password,
});

// --- Usuarios (equipo del negocio) ---

// El dueño da de alta al empleado con una contraseña temporal (mismas reglas que al registrarse).
export const empleadoSchema = z.object({
  nombre: texto("El nombre"),
  email,
  password: registroSchema.shape.password,
});

export const editarEmpleadoSchema = empleadoSchema
  .pick({ nombre: true, email: true })
  .partial()
  .refine((datos) => Object.keys(datos).length > 0, "No hay cambios que guardar");

// Contraseña temporal nueva que el dueño le asigna al empleado.
export const passwordEmpleadoSchema = empleadoSchema.pick({ password: true });

export const activoSchema = z.object({
  activo: z.boolean({ error: "activo debe ser true o false" }),
});

// --- Ajustes: mi cuenta y mi negocio ---

const passwordActual = z
  .string({ error: "Escribe tu contraseña actual" })
  .min(1, "Escribe tu contraseña actual");

// Cambiar el email pide la contraseña actual (el email es con lo que se entra).
export const miCuentaSchema = z
  .object({
    nombre: texto("Tu nombre"),
    email,
    passwordActual,
  })
  .partial()
  .refine((d) => d.nombre !== undefined || d.email !== undefined, "No hay cambios que guardar")
  .refine((d) => d.email === undefined || d.passwordActual !== undefined, {
    message: "Para cambiar tu email escribe tu contraseña actual",
  });

// Sin passwordActual solo si aún no tiene contraseña (entra con Google): la ruta lo revisa.
export const miPasswordSchema = z
  .object({
    passwordActual: passwordActual.optional(),
    passwordNueva: registroSchema.shape.password,
  })
  .refine((d) => d.passwordNueva !== d.passwordActual, "La contraseña nueva debe ser distinta de la actual");

export const negocioSchema = z.object({
  nombre: texto("El nombre del negocio"),
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

// Quién atiende: id de una persona del negocio, o null = "Sin asignar".
const atiendeId = z.uuid({ error: "La persona que atiende no es válida" }).nullable();

export const citaSchema = z.object({
  clientId: id("el cliente"),
  serviceId: id("el servicio"),
  fechaHora: z
    .string({ error: "La fecha y hora es obligatoria" })
    .pipe(z.coerce.date({ error: "La fecha y hora no es válida" })),
  atiendeId: atiendeId.optional(),
});

// Reagendar solo mueve la fecha: cambiar de servicio es cancelar y agendar otra.
export const reagendarSchema = citaSchema.pick({ fechaHora: true });

// Reasignar: a otra persona o a "Sin asignar" (null). La llave es obligatoria.
export const reasignarSchema = z.object({ atiendeId });

export const estadoSchema = z.object({
  estado: z.enum(EstadoCita, { error: "Estado no válido" }),
});

// --- Dashboard ---

// Un mes más margen por el cambio de horario (Tijuana sí lo tiene).
const MAX_RANGO_MS = 32 * 24 * 60 * 60 * 1000;

const fecha = (campo: string) =>
  z
    .string({ error: `Falta ${campo}` })
    .pipe(z.coerce.date({ error: `${campo} no es una fecha válida` }));

// Los rangos los calcula el front con su hora local: el server está en UTC y no sabe
// cuándo empieza "hoy" para el negocio.
export const resumenSchema = z
  .object({
    hoyDesde: fecha("hoyDesde"),
    hoyHasta: fecha("hoyHasta"),
    mesDesde: fecha("mesDesde"),
    mesHasta: fecha("mesHasta"),
  })
  .refine((q) => q.hoyDesde < q.hoyHasta && q.mesDesde < q.mesHasta, "El inicio del rango debe ser antes del fin")
  .refine(
    (q) =>
      q.hoyHasta.getTime() - q.hoyDesde.getTime() <= MAX_RANGO_MS &&
      q.mesHasta.getTime() - q.mesDesde.getTime() <= MAX_RANGO_MS,
    "El rango no puede ser mayor a 32 días",
  );

// --- Filtros de listas ---

// Texto vacío (o solo espacios) cuenta como "sin búsqueda".
export const busquedaClientesSchema = z.object({
  q: z
    .string({ error: "La búsqueda no es válida" })
    .trim()
    .max(50, "La búsqueda puede tener máximo 50 caracteres")
    .optional()
    .transform((q) => q || undefined),
});

// Mismas reglas de rango que el Resumen. desde y hasta van juntos: un rango abierto
// ("todo desde X") no lo usa el front y así no hay que adivinar qué quiso decir.
export const filtroCitasSchema = z
  .object({
    estado: z.enum(EstadoCita, { error: "Estado no válido" }).optional(),
    // "Mis citas": el server pone el id de quien hace la petición; el front no lo manda.
    atiende: z.literal("yo", { error: 'atiende solo acepta "yo"' }).optional(),
    desde: fecha("desde").optional(),
    hasta: fecha("hasta").optional(),
  })
  .refine((q) => (q.desde === undefined) === (q.hasta === undefined), "Manda desde y hasta juntos")
  .refine((q) => !q.desde || !q.hasta || q.desde < q.hasta, "El inicio del rango debe ser antes del fin")
  .refine(
    (q) => !q.desde || !q.hasta || q.hasta.getTime() - q.desde.getTime() <= MAX_RANGO_MS,
    "El rango no puede ser mayor a 32 días",
  );

export type RegistroInput = z.infer<typeof registroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleInput = z.infer<typeof googleSchema>;
export type GoogleRegistroInput = z.infer<typeof googleRegistroSchema>;
export type VerificarCorreoInput = z.infer<typeof verificarCorreoSchema>;
export type OlvideInput = z.infer<typeof olvideSchema>;
export type RestablecerInput = z.infer<typeof restablecerSchema>;
export type EmpleadoInput = z.infer<typeof empleadoSchema>;
export type EditarEmpleadoInput = z.infer<typeof editarEmpleadoSchema>;
export type PasswordEmpleadoInput = z.infer<typeof passwordEmpleadoSchema>;
export type MiCuentaInput = z.infer<typeof miCuentaSchema>;
export type MiPasswordInput = z.infer<typeof miPasswordSchema>;
export type NegocioInput = z.infer<typeof negocioSchema>;
export type ActivoInput = z.infer<typeof activoSchema>;
export type ServicioInput = z.infer<typeof servicioSchema>;
export type EditarServicioInput = z.infer<typeof editarServicioSchema>;
export type ClienteInput = z.infer<typeof clienteSchema>;
export type EditarClienteInput = z.infer<typeof editarClienteSchema>;
export type CitaInput = z.infer<typeof citaSchema>;
export type ReasignarInput = z.infer<typeof reasignarSchema>;
export type ReagendarInput = z.infer<typeof reagendarSchema>;
export type EstadoInput = z.infer<typeof estadoSchema>;
export type ResumenInput = z.infer<typeof resumenSchema>;
export type BusquedaClientesInput = z.infer<typeof busquedaClientesSchema>;
export type FiltroCitasInput = z.infer<typeof filtroCitasSchema>;
