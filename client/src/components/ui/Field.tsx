import { useId } from "react";

export const controlClass =
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-faint transition-colors hover:border-ink-300 focus:border-teal-500 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-teal-500/40";

interface FieldProps {
  label: string;
  hint?: string;
  className?: string;
  children: (id: string) => React.ReactNode;
}

/** Label + control + ayuda opcional. El control recibe el id para asociarse al label. */
export function Field({ label, hint, className = "", children }: FieldProps) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} pr-8 ${className}`} {...props} />;
}
