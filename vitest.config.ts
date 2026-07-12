import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Solid transform + browser conditions are needed by the component tests
  // (files with `@vitest-environment jsdom`); the db/srs tests run in plain
  // Node and are unaffected.
  plugins: [solid()],
  resolve: { conditions: ["development", "browser"] },
  test: {
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
  },
});
