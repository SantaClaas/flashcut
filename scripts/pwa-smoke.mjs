// PWA smoke test: serves the production build with wrangler, installs the
// service worker, then KILLS the server and verifies the app still works
// fully offline — including cross-origin isolation (SharedArrayBuffer/OPFS
// die without it) and SPA deep links via navigateFallback.
// Run with: pnpm test:pwa  (needs a prior `pnpm build`; the script has none of
// the usual test-runner conveniences because only the playwright library is
// installed, not @playwright/test.)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

import { chromium } from "playwright";

const port = 8799;
const base = `http://localhost:${port}`;

console.log("starting wrangler dev…");
const server = spawn("pnpm", ["exec", "wrangler", "dev", "--port", String(port)], {
  stdio: ["ignore", "pipe", "inherit"],
});
server.stdout.resume();
try {
  await waitForServer();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("pageerror:", error));

  console.log("loading app + installing service worker…");
  await page.goto(base);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true, "not crossOriginIsolated");
  // `ready` resolves once the SW is active; precaching happens during install,
  // so from here on the full app is in Cache Storage.
  await page.evaluate(() => navigator.serviceWorker.ready);

  console.log("killing server, reloading offline…");
  server.kill("SIGTERM");
  await once(server, "exit");

  await page.reload();
  assert.equal(
    await page.evaluate(() => crossOriginIsolated),
    true,
    "cache-served responses lost COOP/COEP — SharedArrayBuffer is broken offline",
  );
  assert.ok(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
    "page not controlled by service worker",
  );
  // The deck list only renders after the WASM database opened, so this proves
  // the whole stack (SW cache → WASM → OPFS) works offline.
  await page.waitForSelector("text=/No decks yet|cards? due/", { timeout: 15_000 });

  console.log("checking offline deep link (navigateFallback)…");
  await page.goto(`${base}/settings`);
  await page.waitForSelector("text=Check for updates", { timeout: 15_000 });

  await browser.close();
  console.log("PWA smoke test passed ✅");
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("wrangler dev did not become reachable");
}
