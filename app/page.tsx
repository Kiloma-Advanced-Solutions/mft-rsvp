import { redirect } from "next/navigation";

/**
 * `/` has no page of its own: the board at `/events` is the product's front
 * door, and the canonical URL for it.
 *
 * `redirect()` rather than `permanentRedirect()`: a 307 is not cached by the
 * browser, so `/` stays free to become a page again later without visitors
 * being stuck on a remembered 308.
 */
export default function RootPage() {
  redirect("/events");
}
