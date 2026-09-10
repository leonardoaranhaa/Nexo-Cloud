import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(root, "node_modules/@electric-sql/pglite/dist");
const outputDir = join(root, ".vercel/output/functions/__server.func/_libs");
const assets = ["pglite.data", "pglite.wasm", "initdb.wasm"];

if (!existsSync(outputDir)) {
  console.warn("[pglite-assets] Nitro server library directory not found; skipping");
  process.exit(0);
}

for (const asset of assets) {
  const source = join(sourceDir, asset);
  if (!existsSync(source)) throw new Error(`[pglite-assets] missing source asset: ${source}`);
  copyFileSync(source, join(outputDir, asset));
}

console.log(`[pglite-assets] copied ${assets.join(", ")} to ${outputDir}`);
