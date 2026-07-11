// Same conditional polyfill as src/index.tsx, for Node test runs.
if (!("Temporal" in globalThis)) {
  const { Temporal, toTemporalInstant } = await import("temporal-polyfill");
  globalThis.Temporal = Temporal;
  Date.prototype.toTemporalInstant = toTemporalInstant;
}

export {};
