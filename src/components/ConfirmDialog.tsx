import type { ParentProps } from "solid-js";

/**
 * Modal confirmation dialog, controlled declaratively via the Invoker
 * Commands API: open it from any button with
 * `commandfor={id} command="show-modal"`. Cancel and confirm close it with
 * `command="close"`; the confirm button additionally runs `onConfirm`.
 */
export function ConfirmDialog(
  props: ParentProps<{
    id: string;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>,
) {
  return (
    <dialog
      id={props.id}
      closedby="any"
      class="card m-auto w-full max-w-sm space-y-3 backdrop:bg-stone-950/50"
      onClick={lightDismissFallback}
    >
      <h2 class="text-sm font-semibold">{props.title}</h2>
      <div class="text-sm text-stone-600 dark:text-stone-400">{props.children}</div>
      <div class="flex justify-end gap-2">
        <button class="btn-ghost" commandfor={props.id} command="close">
          Cancel
        </button>
        <button
          class="btn-danger"
          commandfor={props.id}
          command="close"
          onClick={() => props.onConfirm()}
        >
          {props.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/**
 * closedby="any" closes the dialog on backdrop clicks natively, but Safari
 * doesn't support it yet — emulate it there. A backdrop click dispatches on
 * the dialog element itself with coordinates outside its content box.
 */
function lightDismissFallback(event: MouseEvent & { currentTarget: HTMLDialogElement }) {
  const dialog = event.currentTarget;
  if ("closedBy" in HTMLDialogElement.prototype || event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  const inside =
    rect.top <= event.clientY &&
    event.clientY <= rect.bottom &&
    rect.left <= event.clientX &&
    event.clientX <= rect.right;
  if (!inside) dialog.close();
}
