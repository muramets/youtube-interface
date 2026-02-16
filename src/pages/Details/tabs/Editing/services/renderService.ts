/**
 * renderService.ts — Main-thread orchestrator for video rendering
 *
 * Responsibilities:
 * 1. Load image → createImageBitmap (transferable)
 * 2. Mix audio → raw Float32Array channels (transferable)
 * 3. Spawn render.worker.ts, transfer data zero-copy
 * 4. Forward progress/complete/error messages to caller
 * 5. Handle abort via worker.postMessage({ type: 'abort' })
 */
import {
    RESOLUTION_PRESETS,
    type RenderResolution,
    type TimelineTrack,
} from '../../../../../core/types/editing';
import { mixTracks } from './audioMixer';

// ─── YouTube-compliant bitrates (SDR, 30fps) ──────────────────────────
export const BITRATE_MAP: Record<RenderResolution, number> = {
    '720p': 5_000_000,
    '1080p': 8_000_000,
    '1440p': 16_000_000,
    '4k': 35_000_000,
};

const FPS = 30;
const AUDIO_BITRATE = 192_000;
const KEY_FRAME_INTERVAL = 0.5; // seconds → every 15 frames at 30fps

// ─── Render config ─────────────────────────────────────────────────────
export interface RenderConfig {
    videoTitle: string;
    imageUrl: string;
    tracks: TimelineTrack[];
    resolution: RenderResolution;
    loopCount: number;
    volume: number;
    onProgress: (pct: number) => void;
    abortSignal: AbortSignal;
}

export interface RenderResult {
    blob: Blob;
    fileName: string;
}

// ─── Deferred helper (ES2022 polyfill for Promise.withResolvers) ────────
function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** Sanitise a string for use as a filename (remove filesystem-unsafe chars) */
function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, ' ').trim() || 'render';
}

// ─── Main render function ──────────────────────────────────────────────
export async function renderVideo(config: RenderConfig): Promise<RenderResult> {
    const {
        videoTitle, imageUrl, tracks, resolution, loopCount,
        volume, onProgress, abortSignal,
    } = config;

    const preset = RESOLUTION_PRESETS[resolution];
    const bitrate = BITRATE_MAP[resolution];

    // ── 1. Prepare image as transferable ImageBitmap ────────────────
    checkAbort(abortSignal);
    onProgress(1);

    const imageBitmap = await loadImageBitmap(imageUrl);

    // ── 2. Mix audio → transferable Float32Array channels ──────────
    checkAbort(abortSignal);
    onProgress(2);

    const mixedAudio = await mixTracks(tracks, volume, loopCount, abortSignal);
    const totalFrames = Math.ceil(mixedAudio.duration * FPS);

    checkAbort(abortSignal);
    onProgress(5);

    // ── 3. Spawn worker and transfer data ──────────────────────────
    const { promise, resolve, reject } = createDeferred<RenderResult>();

    const worker = new Worker(
        new URL('./render.worker.ts', import.meta.url),
        { type: 'module' },
    );

    // Safety-net: reject if worker goes silent for 10 minutes
    const safetyTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('Render timed out after 10 minutes'));
    }, 10 * 60 * 1000);

    // Handle abort: forward to worker then terminate
    const onAbort = () => {
        worker.postMessage({ type: 'abort' });
        // Give worker a moment to cancel gracefully, then force-terminate
        setTimeout(() => worker.terminate(), 500);
    };

    if (abortSignal.aborted) {
        clearTimeout(safetyTimeout);
        worker.terminate();
        return Promise.reject(new DOMException('Render cancelled', 'AbortError'));
    }

    abortSignal.addEventListener('abort', onAbort, { once: true });

    function cleanup() {
        clearTimeout(safetyTimeout);
        abortSignal.removeEventListener('abort', onAbort);
        worker.terminate();
    }

    // Listen for worker messages
    worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;

        switch (msg.type) {
            case 'progress':
                onProgress(msg.pct);
                break;

            case 'complete': {
                cleanup();
                const blob = new Blob([msg.buffer], { type: 'video/mp4' });
                const fileName = `${sanitizeFilename(videoTitle)}_${resolution}.mp4`;
                resolve({ blob, fileName });
                break;
            }

            case 'cancelled':
                cleanup();
                reject(new DOMException('Render cancelled', 'AbortError'));
                break;

            case 'error':
                cleanup();
                reject(new Error(msg.message || 'Worker render error'));
                break;
        }
    };

    worker.onerror = (err) => {
        cleanup();
        reject(new Error(`Worker error: ${err.message}`));
    };

    // Build transferable arrays list
    const transferables: Transferable[] = [
        imageBitmap,
        ...mixedAudio.channels.map((ch) => ch.buffer),
    ];

    // Send start message with zero-copy transfer
    worker.postMessage(
        {
            type: 'start',
            imageBitmap,
            audioChannels: mixedAudio.channels,
            audioSampleRate: mixedAudio.sampleRate,
            audioFrameCount: mixedAudio.frameCount,
            width: preset.width,
            height: preset.height,
            fps: FPS,
            videoBitrate: bitrate,
            audioBitrate: AUDIO_BITRATE,
            keyFrameInterval: KEY_FRAME_INTERVAL,
            totalFrames,
        },
        { transfer: transferables },
    );

    return promise;
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function loadImageBitmap(url: string): Promise<ImageBitmap> {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`Failed to load image: ${response.statusText}`);
    const blob = await response.blob();
    return createImageBitmap(blob);
}

function checkAbort(signal: AbortSignal) {
    if (signal.aborted) {
        throw new DOMException('Render cancelled', 'AbortError');
    }
}
