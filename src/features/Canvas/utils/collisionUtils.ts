// =============================================================================
// Collision Utilities — pure geometry helpers for canvas node placement
// =============================================================================
//
// Extracted from layoutSlice.ts for clean separation of concerns.
// Zero side effects — pure math only.
// =============================================================================

// ---------------------------------------------------------------------------
// Rect type + overlap detection
// ---------------------------------------------------------------------------

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Returns true if two rects overlap (with an extra gap padding). */
export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
    return (
        a.x < b.x + b.w + gap &&
        a.x + a.w + gap > b.x &&
        a.y < b.y + b.h + gap &&
        a.y + a.h + gap > b.y
    );
}

// ---------------------------------------------------------------------------
// Free-spot finder — spiral grid search for a non-overlapping position
// ---------------------------------------------------------------------------

/**
 * Starting from `preferred`, searches in an expanding spiral grid for the
 * first cell that does not overlap any of `occupied`. Returns the free position.
 */
export function findFreeSpot(
    preferred: { x: number; y: number },
    occupied: Rect[],
    nodeW: number,
    nodeH: number,
    gap: number,
): { x: number; y: number } {
    const stepX = nodeW + gap;
    const stepY = nodeH + gap;
    // Spiral: (0,0), then rings 1, 2, 3 …  up to radius 4 (~25 positions)
    const MAX_RING = 4;
    for (let ring = 0; ring <= MAX_RING; ring++) {
        if (ring === 0) {
            const candidate = { x: preferred.x, y: preferred.y, w: nodeW, h: nodeH };
            if (!occupied.some((o) => rectsOverlap(candidate, o, gap))) {
                return { x: preferred.x, y: preferred.y };
            }
        } else {
            // Walk the perimeter of a (2*ring+1)×(2*ring+1) grid
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dy = -ring; dy <= ring; dy++) {
                    if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue; // only perimeter
                    const cx = preferred.x + dx * stepX;
                    const cy = preferred.y + dy * stepY;
                    const candidate = { x: cx, y: cy, w: nodeW, h: nodeH };
                    if (!occupied.some((o) => rectsOverlap(candidate, o, gap))) {
                        return { x: cx, y: cy };
                    }
                }
            }
        }
    }
    // Fallback: place to the right of everything (canvas is extremely crowded)
    return { x: preferred.x + (MAX_RING + 1) * stepX, y: preferred.y };
}
