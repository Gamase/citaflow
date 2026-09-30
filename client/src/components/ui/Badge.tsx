export type BadgeTone = "amber" | "teal" | "ink" | "neutral" | "danger";

const tones: Record<BadgeTone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-500/40",
  teal: "bg-teal-50 text-teal-700 ring-teal-500/30",
  ink: "bg-ink-900 text-white ring-ink-900",
  neutral: "bg-subtle text-neutral-700 ring-line-strong",
  danger: "bg-danger-50 text-danger ring-danger/25",
};

const dots: Record<BadgeTone, string> = {
  amber: "bg-amber-500",
  teal: "bg-teal-500",
  ink: "bg-white",
  neutral: "bg-faint",
  danger: "bg-danger",
};

export default function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}
