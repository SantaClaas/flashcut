import { onCleanup } from "solid-js";

export const BROADCAST_NAME = "flashcut";
const channel = new BroadcastChannel(BROADCAST_NAME);

/**
 * App-level change events so other tabs can refresh their queries. The posting tab refreshes its
 * own memos directly (a BroadcastChannel does not deliver messages back to the poster).
 */
export type BroadcastMessage =
  | { type: "Decks changed" }
  | { type: "Cards changed"; deckId: number }
  | { type: "Reviews changed"; deckId: number };

export function broadcastMessage(message: BroadcastMessage): void {
  channel.postMessage(message);
}

/** Listen for change events from other tabs for the lifetime of the component. */
export function useBroadcast(callback: (event: MessageEvent<BroadcastMessage>) => void): void {
  const listening = new AbortController();
  const receiver = new BroadcastChannel(BROADCAST_NAME);
  receiver.addEventListener("message", callback, { signal: listening.signal });
  onCleanup(() => {
    listening.abort();
    receiver.close();
  });
}
