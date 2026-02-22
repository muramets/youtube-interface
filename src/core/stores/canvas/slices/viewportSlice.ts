// =============================================================================
// Viewport Slice — pan/zoom state
// =============================================================================

import type { CanvasViewport } from '../../../types/canvas';
import type { CanvasSlice, CanvasState } from '../types';

export const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };

export interface ViewportSlice {
    viewport: CanvasViewport;
    setViewport: CanvasState['setViewport'];
}

export const createViewportSlice: CanvasSlice<ViewportSlice> = (set, get) => ({
    viewport: DEFAULT_VIEWPORT,

    setViewport: (viewport) => {
        set({ viewport });
        get()._save();
    },
});
