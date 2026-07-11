import DOMPurify from "dompurify";
import { marked } from "marked";
import { createMemo } from "solid-js";

export function Markdown(props: { source: string; class?: string }) {
  const html = createMemo(() =>
    DOMPurify.sanitize(marked.parse(props.source, { async: false })),
  );
  return (
    <div
      class={`prose prose-sm max-w-none dark:prose-invert ${props.class ?? ""}`}
      innerHTML={html()}
    />
  );
}
