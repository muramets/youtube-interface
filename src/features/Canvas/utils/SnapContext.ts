// =============================================================================
// SnapContext — Shares snap-to-align state between CanvasOverlay and drag components
// =============================================================================

import { createContext, useContext } from 'react';
import type { useSnapGuides } from '../hooks/useSnapGuides';

/** The return type of useSnapGuides, shared via context */
export type SnapContextValue = ReturnType<typeof useSnapGuides>;

export const SnapContext = createContext<SnapContextValue | null>(null);

/** Access snap utilities from any child of CanvasOverlay */
export function useSnap(): SnapContextValue {
    const ctx = useContext(SnapContext);
    if (!ctx) throw new Error('useSnap must be used within SnapContext.Provider');
    return ctx;
}
