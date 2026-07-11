// @solidjs/router 0.17.0-next.3 still types its components against the
// `solid-js` JSX namespace, which moved to `@solidjs/web` in Solid 2.0.
// Merge the real anchor attributes back in so <A> accepts `class` etc.
// Remove once the router ships types against @solidjs/web.
import type { JSX as WebJSX } from "@solidjs/web";

declare module "solid-js" {
  namespace JSX {
    interface AnchorHTMLAttributes<T> extends WebJSX.AnchorHTMLAttributes<T> {}
  }
}
