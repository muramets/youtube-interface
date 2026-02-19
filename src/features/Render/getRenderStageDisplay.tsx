/**
 * getRenderStageDisplay.tsx — Shared stage/status → icon + label mapping for render UI.
 *
 * Used by RenderProgressBar (editing tab) and RenderQueueFAB (global indicator)
 * to avoid duplicating the same switch-case in multiple components.
 */
import React from 'react';
import { AlertTriangle, CloudDownload, CloudUpload, Link2, Loader2, Clock, Check, XCircle, Ban } from 'lucide-react';
import type { RenderJobStatus } from '../../core/stores/editing/renderQueueStore';

export interface RenderStageDisplay {
    icon: React.ReactNode;
    label: string;
}

/**
 * Maps a render stage to its icon and label.
 * @param stage - Current render stage from Firestore
 * @param size - Icon size in px (12 for progress bar, 10 for FAB)
 * @param progress - Current encoding progress (0-100), used in encoding label
 */
export function getRenderStageDisplay(
    stage: string | undefined,
    size: number,
    progress: number,
): RenderStageDisplay {
    switch (stage) {
        case 'initializing':
            return {
                icon: <Loader2 size={size} className="animate-spin text-text-tertiary" />,
                label: 'Starting render engine...',
            };
        case 'loading_params':
            return {
                icon: <Loader2 size={size} className="animate-spin text-text-tertiary" />,
                label: 'Loading project data...',
            };
        case 'starting':
            return {
                icon: <Loader2 size={size} className="animate-spin text-text-tertiary" />,
                label: 'Preparing your video...',
            };
        case 'stalled':
            return {
                icon: <AlertTriangle size={size} className="text-yellow-400" />,
                label: 'Taking longer than expected...',
            };
        case 'downloading':
            return { icon: <CloudDownload size={size} className="text-text-tertiary" />, label: 'Downloading audio tracks...' };
        case 'encoding':
            return { icon: <Loader2 size={size} className="animate-spin text-text-tertiary" />, label: `Rendering ${Math.round(progress)}%` };
        case 'uploading':
            return { icon: <CloudUpload size={size} className="text-text-tertiary" />, label: 'Uploading...' };
        case 'finalizing':
            return { icon: <Link2 size={size} className="text-text-tertiary" />, label: 'Generating link...' };
        default:
            return { icon: <Loader2 size={size} className="animate-spin text-text-tertiary" />, label: 'Starting...' };
    }
}

// ─── Status-level display (icon + label + color) ───────────────────────

export interface RenderStatusDisplay {
    icon: React.ReactNode;
    label: string;
    colorClass: string;
}

/**
 * Maps a render job status to its icon, label, and color class.
 * Single source of truth — used by RenderProgressBar and RenderJobRow.
 *
 * @param status  - Job status
 * @param size    - Icon size in px
 * @param stage   - Current render stage (only used when status === 'rendering')
 * @param progress - Encoding progress 0-100
 * @param error   - Optional error message for failed statuses
 */
export function getRenderStatusDisplay(
    status: RenderJobStatus,
    size: number,
    stage?: string,
    progress = 0,
    error?: string,
): RenderStatusDisplay {
    switch (status) {
        case 'queued':
            return { icon: <Clock size={size} className="text-text-tertiary" />, label: 'Queued', colorClass: 'text-text-tertiary' };
        case 'rendering': {
            const stageInfo = getRenderStageDisplay(stage, size, progress);
            return { icon: stageInfo.icon, label: stageInfo.label, colorClass: 'text-accent' };
        }
        case 'complete':
            return { icon: <Check size={size} className="text-green-400" />, label: 'Complete', colorClass: 'text-green-400' };
        case 'failed_to_start':
            return { icon: <XCircle size={size} className="text-red-400" />, label: getUserFriendlyError(error)[0], colorClass: 'text-red-400' };
        case 'render_failed':
            return { icon: <XCircle size={size} className="text-red-400" />, label: getUserFriendlyError(error)[0], colorClass: 'text-red-400' };
        case 'cancelled':
            return { icon: <Ban size={size} className="text-yellow-400" />, label: 'Cancelled', colorClass: 'text-yellow-400' };
        default:
            return { icon: null, label: '', colorClass: 'text-text-tertiary' };
    }
}

// ─── Two-tier error mapping ────────────────────────────────────────────

/**
 * Maps raw server errors to user-friendly messages.
 * Returns [userMessage, technicalDetail | null].
 */
export function getUserFriendlyError(raw: string | undefined): [string, string | null] {
    if (!raw) return ['Something went wrong', null];

    const lower = raw.toLowerCase();

    // Firebase / Firestore config errors
    if (lower.includes('firebase') || lower.includes('firestore'))
        return ['Server configuration error — please contact support', raw];

    // FFmpeg / encoding errors
    if (lower.includes('ffmpeg') || lower.includes('encoding') || lower.includes('codec'))
        return ['Video encoding failed — try different settings', raw];

    // Out of memory
    if (lower.includes('enomem') || lower.includes('out of memory') || lower.includes('oom'))
        return ['Server ran out of memory — try a lower resolution', raw];

    // Disk space
    if (lower.includes('enospc') || lower.includes('no space'))
        return ['Server ran out of disk space — try a shorter video', raw];

    // Download / network errors
    if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('download'))
        return ['Failed to download files — please try again', raw];

    // Timeout
    if (lower.includes('timeout') || lower.includes('timed out'))
        return ['Server took too long — please try again', raw];

    // Stall watchdog (client-side) — already user-friendly
    if (lower.includes('server did not respond'))
        return [raw, null];

    // Generic fallback
    return ['Render failed — please try again', raw];
}
