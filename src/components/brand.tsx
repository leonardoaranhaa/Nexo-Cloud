import { cn } from "@/lib/utils";

export function NexoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-elevated" />
      <circle cx="10" cy="16" r="3.6" fill="none" className="stroke-accent" strokeWidth="2" />
      <circle cx="22" cy="16" r="3.6" fill="none" className="stroke-live" strokeWidth="2" />
      <path d="M13.6 16h4.8" className="stroke-accent" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function NexoWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <NexoMark />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-sm font-semibold tracking-tight">Nexo</div>
          <div className="text-[0.65rem] tracking-wide text-subtle uppercase">Cloud Console</div>
        </div>
      )}
    </div>
  );
}
