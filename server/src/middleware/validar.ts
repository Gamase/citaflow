import { RequestHandler } from "express";
import { z } from "zod";

// Valida req.body (o req.query) contra un esquema de zod (ver src/schemas.ts).
// Si falla: 400 con el primer error. Si pasa: la ruta recibe los datos ya limpios,
// en req.body o, para la query, en res.locals.query (Express 5 no deja reescribir req.query).
// Tipa los params como texto para que la ruta siga viendo `req.params.id` como string.
export function validar(
  schema: z.ZodType,
  origen: "body" | "query" = "body",
): RequestHandler<Record<string, string>> {
  return (req, res, next) => {
    const resultado = schema.safeParse((origen === "body" ? req.body : req.query) ?? {});

    if (!resultado.success) {
      const error = resultado.error.issues[0]?.message ?? "Datos inválidos";
      return res.status(400).json({ error });
    }

    if (origen === "body") {
      req.body = resultado.data;
    } else {
      res.locals.query = resultado.data;
    }
    next();
  };
}
