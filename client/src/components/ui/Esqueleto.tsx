// Bloques grises que ocupan el lugar del contenido mientras carga (en lugar de "Cargando…").
// Para lectores de pantalla el contenedor anuncia el texto de `etiqueta`.

export function Esqueleto({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-subtle ${className}`} />;
}

// Lista de filas: avatar opcional, dos líneas de texto y una "pastilla" a la derecha.
export function EsqueletoLista({ etiqueta, filas = 5, avatar = true }: { etiqueta: string; filas?: number; avatar?: boolean }) {
  return (
    <div role="status" aria-label={etiqueta} className="divide-y divide-line">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          {avatar && <Esqueleto className="size-9 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Esqueleto className="h-3.5 w-2/5" />
            <Esqueleto className="h-3 w-1/4" />
          </div>
          <Esqueleto className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
