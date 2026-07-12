import { onSettled, type ParentProps } from "solid-js";

/**
 * Toast rendered as a manual popover: it sits in the top layer (above any open modal dialog) and
 * never light-dismisses. Popovers must still be shown explicitly, and toasts appear on state
 * changes rather than button presses, so opening is programmatic; dismiss buttons close it
 * declaratively with commandfor={id} command="hide-popover".
 */
export function Toast(props: ParentProps<{ id: string }>) {
  let el: HTMLDivElement | undefined;
  onSettled(() => {
    if (el && "showPopover" in el) el.showPopover();
  });
  return (
    <div
      ref={(node) => {
        el = node;
      }}
      id={props.id}
      popover="manual"
      role="status"
      class="card fixed inset-x-0 top-auto bottom-[calc(1rem+env(safe-area-inset-bottom))] mx-auto w-fit max-w-[calc(100%-2rem)] items-center gap-3 p-3 shadow-lg [&:popover-open]:flex"
    >
      {props.children}
    </div>
  );
}
