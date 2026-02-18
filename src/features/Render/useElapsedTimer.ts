import { useState, useEffect } from 'react';
import type { RenderJobStatus } from '../../core/stores/renderQueueStore';

const TERMINAL_STATUSES: ReadonlySet<RenderJobStatus> = new Set([
    'complete', 'render_failed', 'failed_to_start', 'cancelled',
]);

/**
 * Shared hook for tracking elapsed render time.
 *
 * - Ticks every second while the job is active.
 * - Freezes when the job reaches a terminal status.
 * - Uses persisted `renderDurationSecs` when available (hydrated renders).
 */
export function useElapsedTimer(
    startedAt: number | undefined,
    status: RenderJobStatus,
    renderDurationSecs?: number,
): number {
    const [elapsed, setElapsed] = useState(() => {
        if (renderDurationSecs != null) return renderDurationSecs;
        return startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    });

    useEffect(() => {
        if (renderDurationSecs != null) {
            setElapsed(renderDurationSecs);
            return;
        }
        if (!startedAt) return;
        if (TERMINAL_STATUSES.has(status)) {
            setElapsed(Math.floor((Date.now() - startedAt) / 1000));
            return;
        }
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => clearInterval(id);
    }, [startedAt, status, renderDurationSecs]);

    return elapsed;
}

/** Format seconds as `m:ss` */
export function formatElapsed(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
