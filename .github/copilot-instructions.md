# Copilot instructions for this repository

## Build, test, and lint commands

- Use **pnpm** for all commands.
- `pnpm dev` — run the Vite dev server.
- `pnpm build` — typecheck (`tsc -b`) and build production assets.
- `pnpm preview` — build and run local preview via Wrangler.
- `pnpm typecheck` — run TypeScript project builds only.
- `pnpm test` — run the full Vitest suite.
- `pnpm vitest run src/db/repositories.test.ts` — run a single test file (replace path as needed).
- `pnpm test:pwa` — build and run offline/PWA smoke test (`scripts/pwa-smoke.mjs`).
- `pnpm lint` / `pnpm lint:fix` — lint with oxlint.
- `pnpm format` / `pnpm format:check` — format/check formatting with oxfmt.

## High-level architecture

- Flashcut is a **client-only SPA** (Solid 2.0 beta + Tailwind v4) with no backend.
- Persistent data is browser-local SQLite via `@tursodatabase/database-wasm` in OPFS.
- Multi-tab DB access uses a **leader/follower model**:
  - Leader tab acquires a Web Lock, opens the DB, runs migrations, and serves DB RPC.
  - Follower tabs proxy DB calls over BroadcastChannel RPC.
  - See `src/db/client.ts` and `src/lib/broadcast-service.ts`.
- App layering is:
  - UI pages/components (`src/pages`, `src/components`)
  - repository-style DB access (`src/db/{decks,cards,reviews}.ts`)
  - pure FSRS scheduling/mapping (`src/srs/*`)
- Migrations are append-only and versioned with `PRAGMA user_version`; cascading deletes are implemented in repository code, not DB FK cascade (`src/db/migrations.ts`, repository delete functions).
- PWA is handled with `vite-plugin-pwa` (prompted updates, manual SW registration in `src/stores/sw-update.ts`); Turso WASM is intentionally precached with an increased Workbox file-size cap (`vite.config.ts`).
- Cross-origin isolation headers (COOP/COEP) are required in dev and production for SharedArrayBuffer (`vite.config.ts`, `public/_headers`).

## Key conventions

- This codebase uses **Solid 2.0 beta APIs**, not Solid 1.x patterns:
  - Async data with `createMemo(async () => ...)`, invalidated with `refresh(memo)`.
  - Use `<Loading>` / `<Errored>` boundaries and `onSettled` lifecycle where applicable.
- After mutations, pages typically do **both**:
  - local `refresh(...)` for current-tab async memos, and
  - `broadcastMessage(...)` for other tabs (poster does not receive its own broadcast).
  - Study sessions intentionally keep their local queue stable and only emit broadcasts (`src/pages/StudyPage.tsx`).
- Time handling is strict:
  - Use `Temporal` across app code.
  - Keep `Date` conversions at the FSRS boundary (`src/srs/mapping.ts`).
  - Store timestamps as ISO UTC strings with exactly 3 fractional digits (`src/lib/time.ts`).
- Card markdown is rendered via `marked` + `DOMPurify`; do not render unsanitized card HTML (`src/components/Markdown.tsx`).
- Use native `<dialog>` and `[popover]` with Invoker Commands (`commandfor` / `command`) rather than imperative `showModal()` handlers (`src/components/ConfirmDialog.tsx` and pages).
- Styling conventions:
  - Tailwind v4 with shared component classes in `@layer components` (`btn-*`, `input`, `card`, `grade-btn`, etc.).
  - Prefer data/aria attribute variants for stateful styling over dynamic class-string composition (`src/index.css`).
