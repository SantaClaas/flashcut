import { onSettled, type ParentProps } from "solid-js";

/** Convenience component to get tooling support like Tailwind CSS autocomplete for class attribute */
export default function Body(properties: ParentProps<{ class: string }>) {
  // Not sure if onSettled is the right lifecycle moment to change the body CSS
  onSettled(() => {
    const previousClass = document.body.className;
    document.body.className = properties.class;
    return () => {
      document.body.className = previousClass;
    };
  });
  return properties.children;
}
