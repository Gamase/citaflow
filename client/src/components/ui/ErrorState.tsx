import Button from "./Button";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

/** Lo que se ve en lugar de la lista cuando el GET falla (en vez de una lista vacía engañosa). */
export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <p className="max-w-sm text-sm font-medium text-danger">{message}</p>
      <div className="mt-4">
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
