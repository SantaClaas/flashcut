# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Flashcut is a client-side-only SPA for flashcard learning with FSRS spaced repetition. SolidJS + Tailwind CSS v4, data stored in a SQLite database running in the browser (Turso WASM, persisted in OPFS). No backend.

## Commands

Always use **pnpm** (never npm/npx; use `pnpm dlx` instead of npx).

- `pnpm dev` — dev server
- `pnpm build` — typecheck (`tsc -b`) + production build
- `pnpm preview` — serve the production build
- `pnpm test` — run all tests (Vitest, Node environment)
- `pnpm vitest run src/db/repositories.test.ts` — run a single test file
- `pnpm typecheck` — typecheck only

## Architecture

**Storage:** `@tursodatabase/database-wasm` — SQLite in the browser, persisted in OPFS. It needs SharedArrayBuffer, so COOP/COEP headers are mandatory in dev AND production (`vite.config.ts` sets them for dev/preview; `public/_headers` for Netlify/Cloudflare; plain GitHub Pages cannot host this app). Only one tab can hold the database; `App.tsx`'s ErrorBoundary shows the multi-tab error screen. Import from `@tursodatabase/database-wasm/vite` (dev-server workaround baked into the export map).

**Layering** (UI → db, with srs as pure functions in between):

- `src/db/client.ts` — lazy connection singleton (`getDb`) + `closeDb` (used around OPFS file import/export). Runs migrations on open.
- `src/db/migrations.ts` — append-only SQL migrations, tracked via `PRAGMA user_version`. Cascading deletes happen in repository code, not via FK enforcement.
- `src/db/{decks,cards,reviews}.ts` — repository functions. All take a `DbConnection` parameter so tests can inject `@tursodatabase/database` (the Node build with an identical async API — this is why tests run in plain Node, no browser needed).
- `src/srs/` — ts-fsrs wrapper. `mapping.ts` is the ONLY place that converts between ts-fsrs `Date`s, stored ISO strings, and `Temporal` — keep it that way.
- `src/pages/` — one lazy-loaded component per route (routes defined in `src/index.tsx`).
- `src/lib/deck-json.ts`, `src/lib/db-file.ts` — deck JSON import/export and raw SQLite file export/import (checkpoint WAL + close connection before touching the OPFS file).

**Dates/times:** use the `Temporal` API, never `Date` (except inside `src/srs/mapping.ts` at the ts-fsrs boundary). `src/index.tsx` conditionally loads `temporal-polyfill` as a separate chunk; `src/test-setup.ts` does the same for tests. All stored timestamps are ISO-8601 UTC with exactly 3 fractional digits (`lib/time.ts#toIso`) — SQL compares them as strings, so a mixed precision silently breaks ordering.

**FSRS state** lives as columns on `cards` (mirroring the ts-fsrs `Card` type) and `review_logs` (mirroring `ReviewLog`). `State.New` (0) marks unstudied cards; the study queue serves due cards first, then new ones.

**Styling:** Tailwind v4 (CSS-first config in `src/index.css`). Dark mode is a custom variant keyed on `data-color-scheme` on `<html>`, managed by `src/stores/theme.ts` and persisted to localStorage under `color-scheme`. Shared class strings live in `src/lib/ui.ts`, not CSS `@apply`.

**Markdown:** card fronts/backs are markdown, rendered by `src/components/Markdown.tsx` via marked + DOMPurify. Never render card content with raw `innerHTML` without sanitizing.
