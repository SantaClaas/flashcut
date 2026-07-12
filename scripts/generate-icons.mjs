// Regenerates the PNG icon set in public/ from public/favicon.svg.
// Uses Playwright's Chromium instead of sharp so no extra dependency is needed.
//   pnpm exec node scripts/generate-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";

import { chromium } from "playwright";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");

// Maskable icons are cropped (e.g. to a circle), so the artwork must be
// full-bleed with the glyph inside the central 80% safe zone.
const maskableSvg = svg
  .replace(
    'viewBox="0 0 512 512">',
    'viewBox="0 0 512 512"><rect width="512" height="512" fill="#0d9488" /><g transform="translate(51.2 51.2) scale(0.8)">',
  )
  .replace("</svg>", "</g></svg>");

// iOS applies its own corner mask and dislikes transparency.
const appleSvg = svg.replace('rx="104"', 'rx="0"');

const targets = [
  { file: "pwa-192x192.png", size: 192, svg },
  { file: "pwa-512x512.png", size: 512, svg },
  { file: "maskable-icon-512x512.png", size: 512, svg: maskableSvg },
  { file: "apple-touch-icon.png", size: 180, svg: appleSvg },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, svg: source } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${source.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`,
  );
  const out = new URL(`../public/${file}`, import.meta.url);
  writeFileSync(out.pathname, await page.screenshot({ omitBackground: true }));
  console.log(`wrote public/${file}`);
}
await browser.close();
