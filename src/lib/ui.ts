// Shared Tailwind class strings (kept here instead of CSS @apply components).

const btnBase =
  "inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimary = `${btnBase} bg-teal-600 text-white hover:bg-teal-500`;
export const btnGhost = `${btnBase} text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800`;
export const btnDanger = `${btnBase} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`;

export const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-stone-700 dark:bg-stone-900";

export const card =
  "rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900";
