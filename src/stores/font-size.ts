import { createSignal } from "solid-js";

export const FONT_SIZES = ["small", "medium", "large", "x-large"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

const STORAGE_KEY = "font-size";

function savedFontSize(): FontSize {
  const saved = localStorage.getItem(STORAGE_KEY);
  return FONT_SIZES.includes(saved as FontSize) ? (saved as FontSize) : "medium";
}

// The scale for each size is defined as a CSS variable in index.css; this
// attribute only selects which one applies.
function apply(size: FontSize): void {
  document.documentElement.dataset["fontSize"] = size;
}

const initialSize = savedFontSize();
const [size, setSize] = createSignal<FontSize>(initialSize);
apply(initialSize);

export const fontSize = size;

export function setFontSize(next: FontSize): void {
  setSize(next);
  localStorage.setItem(STORAGE_KEY, next);
  apply(next);
}
