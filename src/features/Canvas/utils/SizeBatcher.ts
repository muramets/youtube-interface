// =============================================================================
// SizeBatcher — batched node-size updates with rAF coalescing
// =============================================================================
//
// Accumulates node height changes in a pending map and flushes them
// in a single requestAnimationFrame callback. This prevents
// "Maximum update depth exceeded" when many ResizeObservers fire
// synchronously (e.g. on initial mount or page switch).
//
// Supports one-shot flush listeners for event-driven pipelines:
// after placement, callers can await the next size flush instead of
// guessing timing with nested rAF chains.
// =============================================================================

export type FlushCallback = (batch: Record<string, number>) => void;

export class SizeBatcher {
    private _pending: Record<string, number> = {};
    private _rafId: number | null = null;
    private _onFlush: FlushCallback;
    private _afterFlushListeners: Array<() => void> = [];

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
                for (const k of Object.keys(this._pending)) delete this._pending[k];
                this._onFlush(batch);

                // Fire and clear one-shot listeners
                const listeners = this._afterFlushListeners.splice(0);
                for (const cb of listeners) cb();
            });
        }
    }

    /**
     * Register a one-shot callback that fires after the next flush completes.
     * Auto-removed after firing. Returns a cleanup function to cancel.
     */
    onNextFlush(cb: () => void): () => void {
        this._afterFlushListeners.push(cb);
        return () => {
            const idx = this._afterFlushListeners.indexOf(cb);
            if (idx >= 0) this._afterFlushListeners.splice(idx, 1);
        };
    }

    /** Cancel any pending rAF and listeners. */
    destroy(): void {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._pending = {};
        this._afterFlushListeners.length = 0;
    }
}
