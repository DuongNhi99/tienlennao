/**
 * Navigates with a full page load after the session changes (sign-in, sign-out). The server
 * then renders with the new session, and no client state (query caches, router cache) from
 * the previous account survives. Replaces the history entry, so Back does not return to the
 * submitted form.
 *
 * Client-side `router.replace()` + `router.refresh()` is not used: the refresh re-renders the
 * current page and can supersede the pending navigation, leaving the user on the form.
 */
export function navigateAfterSessionChange(path: string): void {
  window.location.replace(path);
}
