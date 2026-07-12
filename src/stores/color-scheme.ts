import { createSignal } from "solid-js";

export const COLOR_SCHEMES = ["system", "light", "dark"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

const STORAGE_KEY = "color-scheme";

function savedColorScheme(): ColorScheme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return COLOR_SCHEMES.includes(saved as ColorScheme) ? (saved as ColorScheme) : "system";
}

// index.css maps the attribute to the CSS color-scheme property; without the
// attribute the page follows the system preference (color-scheme: light dark).
function apply(scheme: ColorScheme): void {
  if (scheme === "system") delete document.documentElement.dataset["colorScheme"];
  else document.documentElement.dataset["colorScheme"] = scheme;
}

const initialScheme = savedColorScheme();
const [scheme, setScheme] = createSignal<ColorScheme>(initialScheme);
apply(initialScheme);

/** The user's setting: "system", "light", or "dark". */
export const colorScheme = scheme;

export function setColorScheme(next: ColorScheme): void {
  setScheme(next);
  localStorage.setItem(STORAGE_KEY, next);
  apply(next);
}
