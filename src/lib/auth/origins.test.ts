import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTrustedOrigins } from "./origins";

describe("buildTrustedOrigins", () => {
  it("includes the permanent origin and exact Vercel deployment aliases", () => {
    const origins = buildTrustedOrigins({
      explicitBaseURL: "https://nexo-cloud-eight.vercel.app/",
      vercelHosts: [
        "nexo-cloud-4von5xkyy-hsantiagodebem-5408s-projects.vercel.app",
        "nexo-cloud-git-main-hsantiagodebem-5408s-projects.vercel.app",
        "https://nexo-cloud-eight.vercel.app",
      ],
    });

    assert.deepEqual(origins, [
      "https://nexo-cloud-eight.vercel.app",
      "https://nexo-cloud-4von5xkyy-hsantiagodebem-5408s-projects.vercel.app",
      "https://nexo-cloud-git-main-hsantiagodebem-5408s-projects.vercel.app",
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://[::1]:8080",
    ]);
  });

  it("does not introduce a broad Vercel wildcard or invalid protocols", () => {
    const origins = buildTrustedOrigins({
      explicitBaseURL: "https://nexo-cloud-eight.vercel.app",
      vercelHosts: ["*.vercel.app", "ftp://invalid.example", "   ", undefined],
    });

    assert.equal(origins.includes("https://*.vercel.app"), false);
    assert.equal(origins.some((origin) => origin.startsWith("ftp:")), false);
    assert.equal(origins.includes("https://nexo-cloud-eight.vercel.app"), true);
  });

  it("keeps the local development origins when no deployed base URL is supplied", () => {
    const origins = buildTrustedOrigins({ vercelHosts: [] });
    assert.deepEqual(origins, [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://[::1]:8080",
    ]);
  });
});
