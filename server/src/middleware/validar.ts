import { RequestHandler } from "express";
import { z } from "zod";

// Valida req.body contra un esquema de zod (ver src/schemas.ts).
// Si falla: 400 con el primer error. Si pasa: reemplaza req.body por los datos ya limpios.
// Tipa los params como texto para que la ruta siga viendo `req.params.id` como string.
export function validar(schema: z.ZodType): RequestHandler<Record<string, string>> {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.body ?? {});

    if (!resultado.success) {
      const error = resultado.error.issues[0]?.message ?? "Datos inválidos";
      return res.status(400).json({ error });
    }

    req.body = resultado.data;
    next();
  };
}
