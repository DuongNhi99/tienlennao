/**
 * UI preview mode renders authenticated screens (lobby, waiting room, game table) with
 * development mock data before the real backend flows exist.
 *
 * It is enabled ONLY when NEXT_PUBLIC_UI_PREVIEW=true is set at build time, and every screen
 * shows a visible "preview data" banner while it is on. Production deployments must not set it.
 * Phases 3 and 5 replace the preview data source with the real API and Socket.IO client.
 */
export function isUiPreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_UI_PREVIEW === 'true';
}
