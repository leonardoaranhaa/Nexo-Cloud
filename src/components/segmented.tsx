import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 rounded-md bg-bg p-1",
        options.length <= 2 && "grid-cols-2",
        options.length === 3 && "grid-cols-3",
        options.length >= 4 && "flex min-w-max",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "h-9 shrink-0 whitespace-nowrap rounded-sm px-2 text-sm transition-colors",
            value === opt.id ? "bg-elevated text-fg" : "text-muted hover:text-fg",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
