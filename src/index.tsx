import "./index.css";
/* @refresh reload */
import { Route, Router } from "@solidjs/router";
import { render } from "@solidjs/web";
import { lazy } from "solid-js";

// Keep the polyfill out of the main bundle: it is only fetched (as its own
// chunk) when the browser lacks native Temporal.
if (!("Temporal" in globalThis)) {
  console.debug("Temporal not found, polyfilling...");
  const { Temporal, toTemporalInstant } = await import("temporal-polyfill");
  globalThis.Temporal = Temporal;
  Date.prototype.toTemporalInstant = toTemporalInstant;
}

// Apply the saved color scheme and font size as side effects of module init.
await import("./stores/color-scheme");
await import("./stores/font-size");

// Register the service worker (no-op in dev) and start update polling.
await import("./stores/sw-update");

const { default: App } = await import("./App");

render(
  () => (
    <Router root={App}>
      <Route path="/" component={lazy(() => import("./pages/DeckListPage"))} />
      <Route path="/decks/:id" component={lazy(() => import("./pages/DeckPage"))} />
      <Route path="/decks/:id/study" component={lazy(() => import("./pages/StudyPage"))} />
      <Route path="/stats" component={lazy(() => import("./pages/StatsPage"))} />
      <Route path="/settings" component={lazy(() => import("./pages/SettingsPage"))} />
      <Route path="/wipe" component={lazy(() => import("./pages/WipePage"))} />
      <Route path="*" component={lazy(() => import("./pages/NotFoundPage"))} />
    </Router>
  ),
  document.body,
);
