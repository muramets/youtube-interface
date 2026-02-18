/**
 * renderService.ts — Client-side orchestrator for server-side video rendering
 *
 * V2: Instead of rendering locally via WebCodecs/Mediabunny Worker,
 * this now calls the `startRender` Cloud Function which enqueues a
 * Cloud Run Job with ffmpeg. Progress is tracked via Firestore onSnapshot.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../../../config/firebase';
import type { RenderResolution } from '../../../../../core/types/editing';

// ─── YouTube-compliant bitrates (SDR, 30fps) ──────────────────────────
// NOTE: Duplicated from cloud-run/render/src/ffmpeg.ts on purpose.
// Used only for pre-render file-size estimation in RenderControls UI.
// Extracting to shared/ is possible but over-engineered for 4 constants.
// If you change these values, update ffmpeg.ts as well.
export const BITRATE_MAP: Record<RenderResolution, number> = {
    '720p': 5_000_000,
    '1080p': 8_000_000,
    '1440p': 16_000_000,
    '4k': 35_000_000,
};

// ─── Types ─────────────────────────────────────────────────────────────

export interface ServerRenderConfig {
    channelId: string;
    videoId: string;
    videoTitle: string;
    imageUrl: string;
    tracks: {
        audioStoragePath: string;
        volume: number;
        trimStart: number;
        trimEnd: number;
        duration: number;
        title: string;
    }[];
    resolution: RenderResolution;
    loopCount: number;
    masterVolume: number;
}

export interface StartRenderResult {
    success: boolean;
    renderId: string;
    renderDocPath: string;
}

// ─── Cloud Function call ───────────────────────────────────────────────

const startRenderFn = httpsCallable<ServerRenderConfig, StartRenderResult>(
    functions,
    'startRender',
);

/**
 * Start a server-side render job.
 * Returns the renderId and Firestore path for progress tracking.
 */
export async function startServerRender(config: ServerRenderConfig): Promise<StartRenderResult> {
    const result = await startRenderFn(config);
    return result.data;
}

// ─── Cancellation ──────────────────────────────────────────────────────

interface CancelRenderConfig {
    channelId: string;
    videoId: string;
    renderId: string;
}

const cancelRenderFn = httpsCallable<CancelRenderConfig, { success: boolean }>(
    functions,
    'cancelRender',
);

/**
 * Cancel a running server-side render job.
 * Signals the Cloud Run Job to abort ffmpeg and clean up.
 */
export async function cancelServerRender(config: CancelRenderConfig): Promise<void> {
    await cancelRenderFn(config);
}

// ─── Deletion ──────────────────────────────────────────────────────────

interface DeleteRenderConfig {
    channelId: string;
    videoId: string;
    renderId: string;
}

const deleteRenderFn = httpsCallable<DeleteRenderConfig, { success: boolean }>(
    functions,
    'deleteRender',
);

/**
 * Permanently delete a render — removes R2 file and Firestore doc.
 */
export async function deleteServerRender(config: DeleteRenderConfig): Promise<void> {
    await deleteRenderFn(config);
}

/** Sanitise a string for use as a filename (remove filesystem-unsafe chars) */
export function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, ' ').trim() || 'render';
}
