import React from 'react';
import type { RenderJobStatus } from '../../../core/stores/editing/renderQueueStore';

// ─── Shared helpers for render status styling ──────────────────────────

function getStatusColorClass(status: RenderJobStatus, shimmer = false): string {
    switch (status) {
        case 'failed_to_start':
        case 'render_failed': return 'bg-red-500';
        case 'cancelled': return 'bg-yellow-500';
        case 'complete': return 'bg-green-500';
        case 'queued': return 'bg-text-tertiary animate-pulse';
        case 'rendering': return shimmer ? 'bg-accent animate-shimmer' : 'bg-accent';
        default: return 'bg-accent';
    }
}

function getStatusWidth(status: RenderJobStatus, progress: number): number {
    if (status === 'cancelled' || status === 'queued' || status === 'render_failed' || status === 'failed_to_start') return 100;
    return progress;
}

// ─── Reusable progress bar ─────────────────────────────────────────────

interface RenderStatusBarProps {
    status: RenderJobStatus;
    progress: number;
    /** Height class, e.g. "h-1" or "h-1.5" */
    heightClass?: string;
    /** Background class for the track */
    bgClass?: string;
    /** Enable shimmer animation during rendering */
    shimmer?: boolean;
}

export const RenderStatusBar: React.FC<RenderStatusBarProps> = ({
    status,
    progress,
    heightClass = 'h-1.5',
    bgClass = 'bg-bg-secondary',
    shimmer = false,
}) => (
    <div className={`${heightClass} rounded-full ${bgClass} overflow-hidden`}>
        <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${getStatusColorClass(status, shimmer)}`}
            style={{ width: `${getStatusWidth(status, progress)}%` }}
        />
    </div>
);
