import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { copyText, downloadFile } from "@/lib/utils";

export function CodeBlock({
  code,
  filename,
  maxHeight = true,
}: {
  code: string;
  filename?: string;
  maxHeight?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate font-mono text-xs text-muted">{filename ?? "código"}</span>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void copyText(code).then(() => toast("Copiado"));
            }}
          >
            <Copy className="size-3.5" />
            Copiar
          </Button>
          {filename ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                downloadFile(filename, code);
                toast("Arquivo baixado");
              }}
            >
              <Download className="size-3.5" />
              Baixar
            </Button>
          ) : null}
        </div>
      </div>
      <pre
        className={
          maxHeight
            ? "max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed text-muted"
            : "overflow-auto p-3 font-mono text-xs leading-relaxed text-muted"
        }
      >
        {code}
      </pre>
    </div>
  );
}
