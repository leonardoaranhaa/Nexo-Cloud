#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const baseUrl = (process.env.NEXO_SMOKE_BASE_URL || "http://127.0.0.1:8081").replace(/\/$/, "");
const root = "/workspace/screenshots/nexo-matrix";
const routes = ["/", "/agents", "/connections", "/create", "/workflows", "/runs", "/settings", "/marketplace", "/inbox", "/metrics"];
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const results = [];
for (const route of routes) {
  const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
  const png = join(root, `${slug}.png`);
  const command = spawnSync(process.execPath, ["scripts/browser-smoke.mjs", `${baseUrl}${route}`, png], { encoding: "utf8", env: process.env });
  const verdictPath = png.replace(/\.png$/, ".verdict.json");
  let verdict = { ok: false, error: command.stderr?.trim() || command.stdout?.trim() || `exit ${command.status}` };
  try { verdict = JSON.parse(readFileSync(verdictPath, "utf8")); } catch { /* child emitted the failure */ }
  const viewports = verdict.viewports ?? {};
  const failures = Object.entries(viewports).flatMap(([name, value]) => [
    ...(value.status !== 200 ? [`${name}:HTTP_${value.status}`] : []),
    ...(value.horizontalOverflow ? [`${name}:HORIZONTAL_OVERFLOW`] : []),
    ...(value.consoleErrors ?? []).map((error) => `${name}:CONSOLE:${error}`),
    ...(value.pageErrors ?? []).map((error) => `${name}:PAGE:${error}`),
  ]);
  results.push({ route, exitCode: command.status, failures, verdict });
}
const summary = { baseUrl, routes: results, ok: results.every((result) => result.exitCode === 0 && result.failures.length === 0) };
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
