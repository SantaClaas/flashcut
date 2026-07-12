import { A } from "@solidjs/router";
import { Errored, Loading, type ParentProps } from "solid-js";

import { btnGhost, btnPrimary } from "./lib/ui";
import {
  COLOR_SCHEMES,
  type ColorScheme,
  colorScheme,
  setColorScheme,
} from "./stores/color-scheme";

const SCHEME_ICONS: Record<ColorScheme, string> = { system: "🌗", light: "☀️", dark: "🌙" };

function cycleColorScheme() {
  const index = COLOR_SCHEMES.indexOf(colorScheme());
  setColorScheme(COLOR_SCHEMES[(index + 1) % COLOR_SCHEMES.length] as ColorScheme);
}

function navLink(active?: boolean) {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-stone-200 dark:hover:bg-stone-800 ${
    active ? "text-teal-600 dark:text-teal-400" : "text-stone-600 dark:text-stone-300"
  }`;
}

function ErrorScreen(props: { error: () => unknown; reset: () => void }) {
  const message = () => {
    const error = props.error();
    return error instanceof Error ? error.message : String(error);
  };
  return (
    <div class="mx-auto mt-16 max-w-md text-center">
      <h1 class="text-lg font-semibold">Something went wrong</h1>
      <p class="mt-3 text-sm text-stone-600 dark:text-stone-400">
        Something went wrong while talking to the local database. Reloading usually fixes it — if
        the problem persists, export your data from Settings and file an issue.
      </p>
      <p class="mt-3 font-mono text-xs break-all text-stone-500">{message()}</p>
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
            onClick={cycleColorScheme}
            title={`Color scheme: ${colorScheme()}`}
            aria-label={`Color scheme: ${colorScheme()}. Activate to switch.`}
          >
            <span aria-hidden="true">{SCHEME_ICONS[colorScheme()]}</span>
          </button>
        </nav>
      </header>
      <main>
        <Errored fallback={(error, reset) => <ErrorScreen error={error} reset={reset} />}>
          <Loading fallback={<p class="mt-8 text-center text-sm text-stone-500">Loading…</p>}>
            {props.children}
          </Loading>
        </Errored>
      </main>
    </div>
  );
}
