import "./index.css";
/* @refresh reload */
import { Route, Router } from "@solidjs/router";
import { render } from "@solidjs/web";
import { lazy } from "solid-js";

import { DefaultLayout } from "./components/DefaultLayout";

// Keep the polyfill out of the main bundle: it is only fetched (as its own
// chunk) when the browser lacks native Temporal.
if (!("Temporal" in globalThis)) {
  console.debug("Temporal not found, polyfilling...");
  const { Temporal, toTemporalInstant } = await import("temporal-polyfill");
  globalThis.Temporal = Temporal;
  Date.prototype.toTemporalInstant = toTemporalInstant;
}

// Same treatment for the Invoker Commands API (button command/commandfor,
// used for dialogs and popovers): only fetched when native support is missing.
if (!("commandForElement" in HTMLButtonElement.prototype)) {
  console.debug("Invoker commands not found, polyfilling...");
  await import("invokers-polyfill");
}

//TODO: why are we using so many imports here? Why would it not be better for them to be layed out at the top as ESM imports?
// Apply the saved color scheme and font size as side effects of module init.
await import("./stores/color-scheme");
await import("./stores/font-size");

// Register the service worker (no-op in dev) and start update polling.
await import("./stores/sw-update");

render(
  () => (
    <Router>
      <Route component={DefaultLayout}>
        <Route path="/" component={lazy(() => import("./pages/DeckListPage"))} />
        <Route path="/decks/:id" component={lazy(() => import("./pages/DeckPage"))} />
        <Route path="/stats" component={lazy(() => import("./pages/StatsPage"))} />
        <Route path="/settings" component={lazy(() => import("./pages/SettingsPage"))} />
        <Route path="/wipe" component={lazy(() => import("./pages/WipePage"))} />
        <Route path="*" component={lazy(() => import("./pages/NotFoundPage"))} />
      </Route>
      <Route path="/decks/:id/study" component={lazy(() => import("./pages/StudyPage"))} />
    </Router>
  ),
  document.body,
);
