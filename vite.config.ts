import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solid from "vite-plugin-solid";

const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as {
  version: string;
};

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// @tursodatabase/database-wasm uses SharedArrayBuffer, which requires cross-origin
// isolation in dev AND production (see public/_headers for deployed hosts).
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      // Updates are user-confirmed via the banner in App.tsx (an automatic
      // reload would kill an in-progress study session and could reload the
      // leader tab mid-write).
      registerType: "prompt",
      injectRegister: false, // registered manually in src/stores/sw-update.ts
      manifest: {
        name: "Flashcut",
        short_name: "Flashcut",
        description:
          "Flashcard learning with FSRS spaced repetition. All data stays in your browser.",
        display: "standalone",
        start_url: "/",
        background_color: "#f5f5f4", // stone-100, matches body background
        theme_color: "#f5f5f4",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // json covers the bundled starter decks (public/decks) so importing
        // them from Settings works offline.
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,json,webmanifest}"],
        // The Turso WASM build is ~9 MB; Workbox's 2 MB default would silently
        // drop it from the precache and break the app offline.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  // optimizeDeps: {
  //   exclude: ["@tursodatabase/database-wasm"],
  // },
});
