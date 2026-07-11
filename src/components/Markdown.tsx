import DOMPurify from "dompurify";
import { marked } from "marked";
import { createMemo } from "solid-js";

export function Markdown(props: { source: string; class?: string }) {
  const html = createMemo(() => DOMPurify.sanitize(marked.parse(props.source, { async: false })));
  return (
    <div
      class={`prose prose-sm dark:prose-invert max-w-none ${props.class ?? ""}`}
      innerHTML={html()}
    />
  );
}
