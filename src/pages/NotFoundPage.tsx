import { A } from "@solidjs/router";


export default function NotFoundPage() {
  return (
    <div class="mt-16 space-y-4 text-center">
      <h1 class="text-lg font-semibold">Page not found</h1>
      <A href="/" class="btn-primary">
        Back to decks
      </A>
    </div>
  );
}
