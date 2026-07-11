import { A } from "@solidjs/router";
import { ErrorBoundary, type ParentProps, Show, Suspense } from "solid-js";

import { colorScheme, toggleColorScheme } from "./stores/theme";
import { btnGhost, btnPrimary } from "./lib/ui";

function navLink(active?: boolean) {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-stone-200 dark:hover:bg-stone-800 ${
    active ? "text-teal-600 dark:text-teal-400" : "text-stone-600 dark:text-stone-300"
  }`;
}

function ErrorScreen(props: { error: unknown; reset: () => void }) {
  const message = () => (props.error instanceof Error ? props.error.message : String(props.error));
  return (
    <div class="mx-auto mt-16 max-w-md text-center">
      <h1 class="text-lg font-semibold">Something went wrong</h1>
      <p class="mt-3 text-sm text-stone-600 dark:text-stone-400">
        The local database could not be opened. This usually means Flashcut is already open in
        another tab — the database can only be used by one tab at a time.
      </p>
      <p class="mt-3 font-mono text-xs text-stone-500 break-all">{message()}</p>
      <button class={`${btnPrimary} mt-6`} onClick={() => props.reset()}>
        Try again
      </button>
    </div>
  );
}

export default function App(props: ParentProps) {
  return (
    <div class="mx-auto max-w-3xl px-4 pb-16">
      <header class="flex items-center justify-between py-6">
        <A href="/" class="text-xl font-bold tracking-tight">
          <span aria-hidden="true">⚡️</span> Flashcut
        </A>
        <nav class="flex items-center gap-1">
          <A href="/stats" class={navLink()}>
            Stats
          </A>
          <A href="/settings" class={navLink()}>
            Settings
          </A>
          <button
            class={btnGhost}
            onClick={toggleColorScheme}
            title="Toggle color scheme"
            aria-label="Toggle color scheme"
          >
            <Show when={colorScheme() === "dark"} fallback={<span aria-hidden="true">🌙</span>}>
              <span aria-hidden="true">☀️</span>
            </Show>
          </button>
        </nav>
      </header>
      <main>
        <ErrorBoundary fallback={(error, reset) => <ErrorScreen error={error} reset={reset} />}>
          <Suspense
            fallback={<p class="mt-8 text-center text-sm text-stone-500">Loading…</p>}
          >
            {props.children}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
