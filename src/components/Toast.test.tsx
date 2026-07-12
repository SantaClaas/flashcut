import { render } from "@solidjs/web";
import { apply } from "invokers-polyfill/fn";
// @vitest-environment jsdom
import { flush } from "solid-js";
import { afterEach, beforeAll, expect, test } from "vitest";

import { Toast } from "./Toast";

// jsdom implements neither the Popover API nor invoker commands. Stub the
// small popover surface Toast and the polyfill touch (tracking open state in
// a data attribute), then let the real polyfill drive command/commandfor.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "popover", {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute("popover");
    },
  });
  HTMLElement.prototype.showPopover = function () {
    this.setAttribute("data-popover-open", "");
  };
  HTMLElement.prototype.hidePopover = function () {
    this.removeAttribute("data-popover-open");
  };
  const nativeMatches = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selector: string) {
    if (selector === ":popover-open") return this.hasAttribute("data-popover-open");
    return nativeMatches.call(this, selector);
  } as Element["matches"];
  apply();
});

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

function toast(): HTMLElement {
  const el = document.getElementById("toast-test");
  if (!el) throw new Error("No toast rendered");
  return el;
}

test("shows itself as a popover on mount", () => {
  dispose = render(() => <Toast id="toast-test">Hello</Toast>, document.body);
  flush();
  expect(toast().matches(":popover-open")).toBe(true);
});

test("a hide-popover invoker button dismisses it", () => {
  dispose = render(
    () => (
      <Toast id="toast-test">
        <button commandfor="toast-test" command="hide-popover">
          Later
        </button>
      </Toast>
    ),
    document.body,
  );
  flush();
  expect(toast().matches(":popover-open")).toBe(true);

  toast().querySelector("button")!.click();
  expect(toast().matches(":popover-open")).toBe(false);
});
