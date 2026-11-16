import { Prisma, type PrismaClient } from "@prisma/client";

// Slug de un negocio: su nombre en la URL de la página pública de reservas (/reservar/<slug>).
// Se genera del nombre al crear el negocio y no cambia aunque el nombre cambie.
//
// Las funciones que consultan reciben el cliente de Prisma: es el `prisma` base, porque Tenant
// no tiene RLS y el slug es único entre TODOS los negocios (no solo dentro de uno).
// Este archivo no importa db.ts: así seed-data.ts y pruebas.sh pueden usar slugDe sin BD.

type Db = Pick<PrismaClient, "tenant">;

export const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LARGO_MAX = 40;

// "Café Ñandú & Co." → "cafe-nandu-co": minúsculas, sin acentos, y todo lo que no sea letra o
// número se vuelve guion. Es la misma regla con la que la migración reservas_en_linea llenó
// los negocios que ya existían.
export function slugDe(nombre: string): string {
  const base = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // los acentos y la tilde de la ñ, ya separados de su letra
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LARGO_MAX)
    .replace(/-+$/, "");
  return base || "negocio";
}

// Slug libre para un negocio: el de su nombre o, si ya está tomado, con -2, -3…
export async function slugLibre(db: Db, nombre: string): Promise<string> {
  const base = slugDe(nombre);
  for (let n = 1; ; n++) {
    const candidato = n === 1 ? base : `${base}-${n}`;
    const tomado = await db.tenant.findUnique({ where: { slug: candidato }, select: { id: true } });
    if (!tomado) return candidato;
  }
}

function chocaElSlug(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes("slug") : String(target ?? "").includes("slug");
}

// Guarda algo que necesita un slug libre (un negocio nuevo). Entre elegir el slug y guardar,
// otro registro con el mismo nombre puede ganarlo: si el índice único lo rechaza, se elige el
// siguiente y se reintenta. Cualquier otro error (p. ej. el correo repetido) sale tal cual.
export async function crearConSlug<T>(db: Db, nombre: string, crear: (slug: string) => Promise<T>): Promise<T> {
  for (let intento = 1; intento <= 5; intento++) {
    const slug = await slugLibre(db, nombre);
    try {
      return await crear(slug);
    } catch (err) {
      if (!chocaElSlug(err)) throw err;
    }
  }
  throw new Error(`No se pudo encontrar un slug libre para "${nombre}"`);
}

// El slug del negocio. Si no tiene (lo creó el código anterior a las reservas en línea, que
// seguía sirviendo durante el deploy), se le genera en este momento.
export async function asegurarSlug(db: Db, tenantId: string): Promise<string | null> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, nombre: true } });
  if (!tenant) return null;
  if (tenant.slug) return tenant.slug;
  return crearConSlug(db, tenant.nombre, async (slug) => {
    // Solo si sigue sin slug: dos peticiones a la vez no lo cambian dos veces.
    await db.tenant.updateMany({ where: { id: tenantId, slug: null }, data: { slug } });
    const actual = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    return actual?.slug ?? slug;
  });
}
