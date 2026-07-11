import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// @tursodatabase/database-wasm uses SharedArrayBuffer, which requires cross-origin
// isolation in dev AND production (see public/_headers for deployed hosts).
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  // optimizeDeps: {
  //   exclude: ["@tursodatabase/database-wasm"],
  // },
});
