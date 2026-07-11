/// <reference types="vite/client" />

// Global Temporal types; the runtime is native or polyfilled in index.tsx.
import type {} from "temporal-polyfill/types/global";

declare global {
  interface Date {
    toTemporalInstant(this: Date): Temporal.Instant;
  }

  // Build-time constants injected via `define` in vite.config.ts.
  const __APP_VERSION__: string;
  const __GIT_COMMIT__: string;
}

export {};
