interface PageHeaderProps {
  title: React.ReactNode;
  description: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
        <p className="mt-1.5 text-sm text-muted sm:text-base">{description}</p>
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </header>
  );
}
