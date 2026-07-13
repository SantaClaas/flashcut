// @vitest-environment jsdom
import { render } from "@solidjs/web";
import { createMemo, createSignal, Errored, flush, Loading, refresh, Show } from "solid-js";
import { afterEach, expect, test } from "vitest";

/**
 * Canary for a solid-js 2.0.0-beta.17 bug that StudyPage works around.
 *
 * With the non-keyed render-prop form `<Show when={…}>{(item) => …}</Show>`, `item` is a guarded
 * accessor that throws "Stale read from <Show>." when called while `when` is falsy. If an async
 * memo is refresh()ed in the same flush that turns the condition falsy (StudyPage.rate() on the
 * last card: refresh(stateCounts) + setIndex past the queue end), the subtree suspends under
 * <Loading> and child memos re-run reading the accessor AFTER the condition flipped but BEFORE
 * <Show> disposed them — the error escapes to the nearest <Errored>. StudyPage avoids this with
 * `keyed`, which hands the child the plain value instead of a throwing accessor.
 *
 * If the FIRST test below starts FAILING after a solid-js upgrade, the bug is fixed upstream:
 * delete this file and feel free to drop `keyed` from the study-card <Show> in
 * src/pages/StudyPage.tsx.
 */

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

/** Reads props.source in a memo, like components/Markdown.tsx does. */
function Md(props: { source: string }) {
  const html = createMemo(() => props.source.toUpperCase());
  return <div innerHTML={html()} />;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function finishLastCard(opts: { keyed: boolean }) {
  const fetchQueue = async () => [{ id: 1, front: "hello" }];
  const fetchCounts = async () => ({ total: 1 });

  const [index, setIndex] = createSignal(0);
  let refreshStats!: () => void;

  function Page() {
    const queue = createMemo(() => fetchQueue());
    const stats = createMemo(() => fetchCounts());
    refreshStats = () => refresh(stats);
    const current = () => queue()[index()];
    return (
      <div>
        <span id="stats">{stats().total}</span>
        {opts.keyed ? (
          <Show keyed when={current()} fallback={<p id="done">done</p>}>
            {(item) => <Md source={item.front} />}
          </Show>
        ) : (
          <Show when={current()} fallback={<p id="done">done</p>}>
            {(item) => <Md source={item().front} />}
          </Show>
        )}
      </div>
    );
  }

  let error: unknown;
  dispose = render(
    () => (
      <Errored
        fallback={(err) => {
          error = err();
          return <p id="error">boom</p>;
        }}
      >
        <Loading fallback={<p>loading</p>}>
          <Page />
        </Loading>
      </Errored>
    ),
    document.body,
  );
  flush();
  await tick();
  flush();
  expect(document.getElementById("stats")).not.toBeNull();

  // Same flush as StudyPage.rate() on the last card: refresh an unrelated
  // async memo AND move the index past the end of the queue.
  refreshStats();
  setIndex((i) => i + 1);
  flush();
  await tick();
  flush();

  return { error: () => error };
}

test("non-keyed <Show> still throws a stale read (bug present — keep the workaround)", async () => {
  const { error } = await finishLastCard({ keyed: false });
  expect(String(error())).toMatch(/stale (read|value) from <Show>/i);
});

test("keyed <Show> reaches the fallback cleanly (the workaround)", async () => {
  const { error } = await finishLastCard({ keyed: true });
  expect(error()).toBeUndefined();
  expect(document.getElementById("done")).not.toBeNull();
});
