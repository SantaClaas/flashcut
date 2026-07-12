import { createSignal } from "solid-js";
import { registerSW } from "virtual:pwa-register";

const [updateReady, setUpdateReady] = createSignal(false);
const [offlineReady, setOfflineReady] = createSignal(false);

let registration: ServiceWorkerRegistration | undefined;

// In dev (no service worker) registerSW is a no-op and none of the callbacks
// ever fire, so this store is safe to import unconditionally.
const updateServiceWorker = registerSW({
  onNeedRefresh: () => setUpdateReady(true),
  onOfflineReady: () => setOfflineReady(true),
  onRegisteredSW(_url, r) {
    if (!r) return;
    registration = r;
    // An installed PWA can stay open for weeks — re-check hourly and whenever
    // the tab becomes visible again. update() rejects while offline; that is
    // not an error worth surfacing.
    const check = () => void r.update().catch(() => {});
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
});

/** True once a new version is installed and waiting to take over. */
export { offlineReady, updateReady };

export function dismissUpdate(): void {
  setUpdateReady(false);
}

export function dismissOfflineReady(): void {
  setOfflineReady(false);
}

/** Activate the waiting service worker and reload this tab. */
export function applyUpdate(): Promise<void> {
  return updateServiceWorker(true);
}

/**
 * Ask the browser for a new version right now. Resolves true if an update is (or becomes) ready;
 * rejects when the check itself fails, e.g. offline.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  await registration.update();
  const installing = registration.installing;
  if (installing) {
    await new Promise<void>((resolve) => {
      installing.addEventListener("statechange", () => {
        if (installing.state !== "installing") resolve();
      });
    });
  }
  return registration.waiting !== null;
}
