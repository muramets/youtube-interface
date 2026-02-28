// =============================================================================
// SizeBatcher — batched node-size updates with rAF coalescing
// =============================================================================
//
// Accumulates node height changes in a pending map and flushes them
// in a single requestAnimationFrame callback. This prevents
// "Maximum update depth exceeded" when many ResizeObservers fire
// synchronously (e.g. on initial mount or page switch).
//
// Encapsulates what was previously module-level mutable state
// (_pendingSizes, _sizeFlushId) in layoutSlice.ts.
// =============================================================================

export type FlushCallback = (batch: Record<string, number>) => void;

export class SizeBatcher {
    private _pending: Record<string, number> = {};
    private _rafId: number | null = null;
    private _onFlush: FlushCallback;

    constructor(onFlush: FlushCallback) {
        this._onFlush = onFlush;
    }

    /**
     * Schedule a height update for a node.
     * Multiple calls within the same frame are coalesced into a single flush.
     */
    schedule(id: string, height: number): void {
        this._pending[id] = height;
        if (this._rafId === null) {
            this._rafId = requestAnimationFrame(() => {
                this._rafId = null;
                const batch = { ...this._pending };
                // Clear pending before callback to avoid stale reads
                for (const k of Object.keys(this._pending)) delete this._pending[k];
                this._onFlush(batch);
            });
        }
    }

    /** Cancel any pending rAF. Call on component unmount or store teardown. */
    destroy(): void {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._pending = {};
    }
}
