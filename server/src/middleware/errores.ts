import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

// Red de seguridad al final de Express: cualquier error que una ruta no atrapó llega aquí.
// Las rutas siguen dando sus mensajes específicos; esto evita que un caso no previsto
// regrese un stack trace o un 500 con detalles internos.
export function manejarErrores(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un registro con esos datos" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "No encontrado" });
    }
  }

  // JSON mal formado en el body (lo lanza express.json()).
  if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido" });
  }

  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}
