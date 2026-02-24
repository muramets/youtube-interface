// =============================================================================
// Shared live zoom ref — replaces module-level canvasBoardLiveZoom export.
// Updated every rAF frame by useCanvasPanZoom, read by CanvasNodeWrapper at
// drag start. Using a plain object ref avoids React re-renders.
// =============================================================================

/** Current zoom value, updated every animation frame. Read-only for consumers. */
export const liveZoom = { current: 1 };
