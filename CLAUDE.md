# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Flashcut is a client-side-only SPA for flashcard learning with FSRS spaced repetition. SolidJS **2.0 beta** + Tailwind CSS v4, data stored in a SQLite database running in the browser (Turso WASM, persisted in OPFS). No backend.

## Solid 2.0 beta conventions

This repo uses Solid 2.0 (`solid-js@next`, `@solidjs/web`, `@solidjs/router@next`, `vite-plugin-solid@next`) — do NOT use 1.x APIs:

- Async data: `createMemo(async () => …)` (reads suspend under `<Loading>`), NOT `createResource`. Invalidate with `refresh(memo)` after mutations, not `refetch`.
- Boundaries: `<Loading>` (was Suspense) and `<Errored>` (was ErrorBoundary; fallback gets `(err: () => unknown, reset)` — err is an accessor).
- Lifecycle: `onSettled(() => { …; return cleanup })` (was onMount). Split-effect form: `createEffect(compute, apply)`.
- Batching: setters don't update reads until the microtask flush; never read a signal right after setting it expecting the new value (use `flush()` in tests only).
- `render` comes from `@solidjs/web` (not `solid-js/web`); `jsxImportSource` is `@solidjs/web` (tsconfig.app.json).
- `src/router-jsx-compat.d.ts` shims the router's stale JSX types (`<A class=…>`); remove once @solidjs/router ships @solidjs/web-based types.
- Renames if needed later: `mergeProps`→`merge`, `splitProps`→`omit`, `unwrap`→`snapshot`, store setters are draft-first (produce-style).

## Commands

Always use **pnpm** (never npm/npx; use `pnpm dlx` instead of npx).

- `pnpm dev` — dev server
- `pnpm build` — typecheck (`tsc -b`) + production build
- `pnpm preview` — serve the production build
- `pnpm test` — run all tests (Vitest, Node environment)
- `pnpm vitest run src/db/repositories.test.ts` — run a single test file
- `pnpm typecheck` — typecheck only

## Architecture

**Storage:** `@tursodatabase/database-wasm` — SQLite in the browser, persisted in OPFS. It needs SharedArrayBuffer, so COOP/COEP headers are mandatory in dev AND production (`vite.config.ts` sets them for dev/preview; `public/_headers` for Netlify/Cloudflare; plain GitHub Pages cannot host this app). Multiple tabs work via leader election: one tab acquires a Web Lock (`navigator.locks`), opens the real database, and serves all other tabs over a BroadcastChannel RPC (`src/lib/broadcast-service.ts`, crackle-style proxy with correlation ids — BroadcastChannel cannot transfer MessagePorts). Followers are promoted automatically when the leader closes. Import from `@tursodatabase/database-wasm/vite` (dev-server workaround baked into the export map).

**Layering** (UI → db, with srs as pure functions in between):

- `src/db/client.ts` — leader election + `DbService` (exec/run/get/all/exportFile/importFile). `getDb()` returns a `DbConnection` that dispatches locally on the leader and proxies on followers; only the leader runs migrations and may close the database. File export/import goes through `dbService`, never raw OPFS access from followers.
- `src/db/migrations.ts` — append-only SQL migrations, tracked via `PRAGMA user_version`. Cascading deletes happen in repository code, not via FK enforcement.
- `src/db/{decks,cards,reviews}.ts` — repository functions. All take a `DbConnection` parameter so tests can inject `@tursodatabase/database` (the Node build with an identical async API — this is why tests run in plain Node, no browser needed).
- `src/srs/` — ts-fsrs wrapper. `mapping.ts` is the ONLY place that converts between ts-fsrs `Date`s, stored ISO strings, and `Temporal` — keep it that way.
- `src/pages/` — one lazy-loaded component per route (routes defined in `src/index.tsx`).
- `src/lib/deck-json.ts`, `src/lib/db-file.ts` — deck JSON import/export and raw SQLite file export/import (checkpoint WAL + close connection before touching the OPFS file).

**Dates/times:** use the `Temporal` API, never `Date` (except inside `src/srs/mapping.ts` at the ts-fsrs boundary). `src/index.tsx` conditionally loads `temporal-polyfill` as a separate chunk; `src/test-setup.ts` does the same for tests. All stored timestamps are ISO-8601 UTC with exactly 3 fractional digits (`lib/time.ts#toIso`) — SQL compares them as strings, so a mixed precision silently breaks ordering.

**FSRS state** lives as columns on `cards` (mirroring the ts-fsrs `Card` type) and `review_logs` (mirroring `ReviewLog`). `State.New` (0) marks unstudied cards; the study queue serves due cards first, then new ones.

**Styling:** Tailwind v4 (CSS-first config in `src/index.css`). Dark mode is a custom variant keyed on `data-color-scheme` on `<html>`, managed by `src/stores/theme.ts` and persisted to localStorage under `color-scheme`. Shared class strings live in `src/lib/ui.ts`, not CSS `@apply`.

**Markdown:** card fronts/backs are markdown, rendered by `src/components/Markdown.tsx` via marked + DOMPurify. Never render card content with raw `innerHTML` without sanitizing.
