import { existsSync, readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Guards the offline story: if an asset silently falls out of the service
// worker precache (e.g. the ~9 MB Turso WASM outgrowing Workbox's
// maximumFileSizeToCacheInBytes, or a glob change), the app looks fine online
// but breaks completely offline. Runs against the build output, so it needs
// `pnpm build` first and is skipped when dist/ is absent.
const swPath = new URL("../dist/sw.js", import.meta.url);
const assetsDir = new URL("../dist/assets/", import.meta.url);

describe.skipIf(!existsSync(swPath))("service worker precache manifest", () => {
  function precachedUrls(): string[] {
    const sw = readFileSync(swPath, "utf8");
    return [...sw.matchAll(/url:\s*"([^"]+)"/g)].map(([, url]) => url as string);
  }

  it("includes the app shell and the WASM database engine", () => {
    const urls = precachedUrls();
    expect(urls).toContain("index.html");
    expect(urls).toContain("manifest.webmanifest");
    expect(urls.some((url) => url.endsWith(".wasm"))).toBe(true);
    expect(urls.some((url) => url.startsWith("decks/") && url.endsWith(".json"))).toBe(true);
  });

  it("includes every built asset", () => {
    const urls = new Set(precachedUrls());
    for (const file of readdirSync(assetsDir)) {
      expect(urls, `dist/assets/${file} missing from precache`).toContain(`assets/${file}`);
    }
  });
});
