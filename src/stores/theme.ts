import { createSignal } from "solid-js";

type ColorScheme = "light" | "dark";

const STORAGE_KEY = "color-scheme";

function preferredScheme(): ColorScheme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(scheme: ColorScheme): void {
  document.documentElement.dataset["colorScheme"] = scheme;
}

const [scheme, setScheme] = createSignal<ColorScheme>(preferredScheme());
apply(scheme());

export const colorScheme = scheme;

export function toggleColorScheme(): void {
  const next: ColorScheme = scheme() === "dark" ? "light" : "dark";
  setScheme(next);
  localStorage.setItem(STORAGE_KEY, next);
  apply(next);
}
