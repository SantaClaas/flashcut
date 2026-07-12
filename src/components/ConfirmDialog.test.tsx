// @vitest-environment jsdom
import { render } from "@solidjs/web";
import { apply } from "invokers-polyfill/fn";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

// jsdom reflects <dialog open> but implements neither the dialog methods
// (they need top-layer support) nor invoker commands. Stub the methods the
// polyfill and the light-dismiss fallback call, then apply the real polyfill
// so clicks flow through the same command/commandfor path as in production.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  apply();
});

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

function mount(onConfirm: () => void) {
  dispose = render(
    () => (
      <>
        <button commandfor="confirm-test" command="show-modal">
          Trigger
        </button>
        <ConfirmDialog id="confirm-test" title="Sure?" confirmLabel="Do it" onConfirm={onConfirm}>
          Really?
        </ConfirmDialog>
      </>
    ),
    document.body,
  );
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
  if (!match) throw new Error(`No button labeled "${label}"`);
  return match;
}

function dialog(): HTMLDialogElement {
  const el = document.querySelector("dialog");
  if (!el) throw new Error("No dialog rendered");
  return el;
}

test("a show-modal invoker button opens the dialog", () => {
  mount(vi.fn());
  expect(dialog().open).toBe(false);
  button("Trigger").click();
  expect(dialog().open).toBe(true);
});

test("Cancel closes the dialog without confirming", () => {
  const onConfirm = vi.fn();
  mount(onConfirm);
  button("Trigger").click();
  button("Cancel").click();
  expect(dialog().open).toBe(false);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("the confirm button runs onConfirm and closes the dialog", () => {
  const onConfirm = vi.fn();
  mount(onConfirm);
  button("Trigger").click();
  button("Do it").click();
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(dialog().open).toBe(false);
});

test("light-dismiss fallback closes on backdrop clicks only", () => {
  // jsdom has no closedby support, so the click-coordinate fallback is live.
  // Every element rect is 0×0 in jsdom: a click at (100, 100) lands outside
  // the dialog's content box (the backdrop), one at (0, 0) inside it.
  mount(vi.fn());
  button("Trigger").click();

  dialog().dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 0, clientY: 0 }));
  expect(dialog().open).toBe(true);

  dialog().dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 100, clientY: 100 }));
  expect(dialog().open).toBe(false);
});
