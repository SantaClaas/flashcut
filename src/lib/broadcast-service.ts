/**
 * Comlink-style RPC between same-origin tabs, in the spirit of crackle, but over a
 * BroadcastChannel: exactly one tab (the provider, elected elsewhere via the Web Locks API) serves
 * calls from every other tab.
 *
 * Unlike a MessagePort proxy, a BroadcastChannel cannot transfer ports, so each call is correlated
 * with its response by a random id on the shared channel. Consumers discover the provider through a
 * query/ready handshake; the provider announces itself with a random providerId so consumers can
 * tell a leadership change apart from a plain "still here" reply.
 */

/** Every exposed method must be async — the channel makes everything async anyway. */
export type AsyncApi = Record<string, (...parameters: never[]) => Promise<unknown>>;

type ServiceMessage =
  | { scope: string; kind: "call"; id: string; property: string; parameters: unknown[] }
  | { scope: string; kind: "result"; id: string; result: unknown }
  | { scope: string; kind: "error"; id: string; error: unknown }
  | { scope: string; kind: "provider-ready"; providerId: string }
  | { scope: string; kind: "provider-query" };

/**
 * The call had not been sent yet when this tab was promoted to provider — it was never delivered
 * anywhere, so callers may safely retry.
 */
export class ProviderChangedError extends Error {}

/**
 * The provider changed while the call was in flight. The old provider may or may not have applied
 * it, so it is NOT retried automatically.
 */
export class CallLostError extends Error {}

/** A call that reached the provider but failed there. `cause` holds the provider-side error. */
export class RemoteCallError extends Error {}

/** Serve `target`'s methods to all consumer tabs on the channel. */
export function provide<T extends AsyncApi>(
  channel: BroadcastChannel,
  scope: string,
  target: T,
): void {
  const providerId = crypto.randomUUID();
  const ready: ServiceMessage = { scope, kind: "provider-ready", providerId };

  channel.addEventListener("message", (event: MessageEvent<ServiceMessage>) => {
    const message = event.data;
    if (message.scope !== scope) return;
    if (message.kind === "provider-query") {
      channel.postMessage(ready);
      return;
    }
    if (message.kind !== "call") return;
    void (async () => {
      try {
        const method = target[message.property];
        if (typeof method !== "function") {
          throw new Error(`Unknown service method: ${message.property}`);
        }
        const result: unknown = await Reflect.apply(method, target, message.parameters);
        channel.postMessage({
          scope,
          kind: "result",
          id: message.id,
          result,
        } satisfies ServiceMessage);
      } catch (error) {
        try {
          channel.postMessage({
            scope,
            kind: "error",
            id: message.id,
            error,
          } satisfies ServiceMessage);
        } catch {
          // The error wasn't structured-cloneable; send its string form.
          channel.postMessage({
            scope,
            kind: "error",
            id: message.id,
            error: String(error),
          } satisfies ServiceMessage);
        }
      }
    })();
  });

  channel.postMessage(ready);
}

export interface Consumer<T> {
  proxy: T;
  /**
   * Call when this tab itself becomes the provider: calls still waiting for a provider are rejected
   * with ProviderChangedError (retryable), calls already sent to the previous provider with
   * CallLostError.
   */
  handlePromotion(): void;
}

interface PendingCall {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
}

const PROVIDER_QUERY_INTERVAL_MS = 500;

/** A proxy whose method calls are served by whichever tab currently provides `scope`. */
export function consume<T extends AsyncApi>(channel: BroadcastChannel, scope: string): Consumer<T> {
  const sent = new Map<string, PendingCall>();
  let providerId: string | undefined;
  let readyWaiters: PendingCall[] = [];
  let queryTimer: ReturnType<typeof setInterval> | undefined;

  function failSent(reason: Error) {
    const calls = [...sent.values()];
    sent.clear();
    for (const call of calls) call.reject(reason);
  }

  function settleWaiters(settle: (waiter: PendingCall) => void) {
    const waiters = readyWaiters;
    readyWaiters = [];
    if (queryTimer !== undefined) {
      clearInterval(queryTimer);
      queryTimer = undefined;
    }
    for (const waiter of waiters) settle(waiter);
  }

  channel.addEventListener("message", (event: MessageEvent<ServiceMessage>) => {
    const message = event.data;
    if (message.scope !== scope) return;
    if (message.kind === "provider-ready") {
      if (providerId !== undefined && providerId !== message.providerId) {
        failSent(new CallLostError("The database leader changed while a call was in flight."));
      }
      providerId = message.providerId;
      settleWaiters((waiter) => waiter.resolve(undefined));
      return;
    }
    if (message.kind !== "result" && message.kind !== "error") return;
    const call = sent.get(message.id);
    if (!call) return;
    sent.delete(message.id);
    if (message.kind === "result") call.resolve(message.result);
    else
      call.reject(
        new RemoteCallError("The leader tab failed to execute the call.", { cause: message.error }),
      );
  });

  function waitForProvider(): Promise<void> {
    if (providerId !== undefined) return Promise.resolve();
    return new Promise((resolve, reject) => {
      readyWaiters.push({ resolve: () => resolve(), reject });
      channel.postMessage({ scope, kind: "provider-query" } satisfies ServiceMessage);
      queryTimer ??= setInterval(
        () => channel.postMessage({ scope, kind: "provider-query" } satisfies ServiceMessage),
        PROVIDER_QUERY_INTERVAL_MS,
      );
    });
  }

  const handler: ProxyHandler<object> = {
    get(_target, property) {
      // Awaiting the proxy itself must not treat it as a thenable (see crackle).
      if (property === "then") return undefined;
      return async (...parameters: unknown[]) => {
        if (typeof property !== "string") throw new TypeError("Only string methods can be proxied");
        await waitForProvider();
        const id = crypto.randomUUID();
        const response = new Promise((resolve, reject) => sent.set(id, { resolve, reject }));
        channel.postMessage({
          scope,
          kind: "call",
          id,
          property,
          parameters,
        } satisfies ServiceMessage);
        return response;
      };
    },
  };

  return {
    proxy: new Proxy({}, handler) as T,
    handlePromotion() {
      settleWaiters((waiter) =>
        waiter.reject(new ProviderChangedError("This tab became the provider.")),
      );
      failSent(
        new CallLostError("This tab became the database leader while a call was in flight."),
      );
    },
  };
}
