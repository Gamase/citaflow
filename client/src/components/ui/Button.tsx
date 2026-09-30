type Variant = "primary" | "secondary" | "danger" | "ghost" | "link" | "link-danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-teal-700 text-white shadow-card hover:bg-teal-800",
  secondary: "border border-line-strong bg-surface text-fg shadow-card hover:bg-subtle",
  danger: "bg-danger text-white shadow-card hover:bg-danger-hover",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
  link: "text-teal-700 hover:text-teal-800 hover:underline",
  "link-danger": "text-danger hover:text-danger-hover hover:underline",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const isLink = variant === "link" || variant === "link-danger";
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
        variants[variant]
      } ${isLink ? "h-auto px-0.5 text-sm" : sizes[size]} ${className}`}
      {...props}
    />
  );
}
