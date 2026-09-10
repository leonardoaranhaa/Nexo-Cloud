import { cn } from "@/lib/utils";
import type { AgentStatus, ConnectionStatus } from "@/lib/types";

export function StatusDot({
  status,
  className,
}: {
  status: ConnectionStatus | AgentStatus;
  className?: string;
}) {
  const color =
    status === "connected" || status === "live"
      ? "bg-live"
      : status === "qr" || status === "draft"
        ? "bg-warn"
        : status === "paused"
          ? "bg-muted"
          : "bg-danger";
  return <span className={cn("inline-block size-1.5 rounded-full", color, className)} />;
}
