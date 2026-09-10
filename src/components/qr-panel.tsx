import { useMemo } from "react";
import { Button } from "./ui/button";

function cellsFrom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bits: boolean[] = [];
  for (let i = 0; i < 21 * 21; i++) {
    h ^= i + 1;
    h = Math.imul(h, 16777619);
    bits.push((h >>> 0) % 3 !== 0);
  }
  const finder = (x: number, y: number) => {
    for (const [ox, oy] of [
      [0, 0],
      [14, 0],
      [0, 14],
    ] as const) {
      const dx = x - ox;
      const dy = y - oy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
        const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return edge || core;
      }
    }
    return null;
  };
  return { bits, finder };
}

export function QrPanel({
  seed,
  onConfirm,
}: {
  seed: string;
  onConfirm: () => void;
}) {
  const { bits, finder } = useMemo(() => cellsFrom(seed), [seed]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-lg bg-fg p-3">
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns: "repeat(21, 8px)", gridTemplateRows: "repeat(21, 8px)" }}
        >
          {Array.from({ length: 21 * 21 }, (_, i) => {
            const x = i % 21;
            const y = Math.floor(i / 21);
            const forced = finder(x, y);
            const on = forced ?? bits[i];
            return <span key={i} className={on ? "bg-accent-fg" : "bg-fg"} />;
          })}
        </div>
      </div>
      <p className="max-w-xs text-center text-sm text-muted">
        Escaneie com o WhatsApp vinculado. No preview a leitura é simulada — o número real entra
        quando você publica o fluxo.
      </p>
      <Button onClick={onConfirm} variant="live">
        Simular leitura do QR
      </Button>
    </div>
  );
}
