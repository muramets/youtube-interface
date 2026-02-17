import { create } from 'zustand';
import { renderVideo, BITRATE_MAP } from '../../pages/Details/tabs/Editing/services/renderService';
import type { RenderResolution, TimelineTrack } from '../types/editing';
import { getEffectiveDuration } from '../types/editing';

// ─── Render job types ──────────────────────────────────────────────────

export type RenderJobStatus =
    | 'queued'
    | 'rendering'
    | 'complete'
    | 'error'
    | 'cancelled';

export interface RenderJob {
    videoId: string;
    status: RenderJobStatus;
    progress: number;       // 0–100
    error?: string;
    blobUrl?: string;
    fileName?: string;
}

interface RenderJobInternal extends RenderJob {
    abortController: AbortController;
    snapshot: RenderSnapshot;
}

// ─── Snapshot of everything needed to render (decoupled from editingStore) ──

export interface RenderSnapshot {
    videoTitle: string;
    imageUrl: string;
    tracks: TimelineTrack[];
    resolution: RenderResolution;
    loopCount: number;
    volume: number;
}

// ─── Store ─────────────────────────────────────────────────────────────

interface RenderQueueState {
    /** All jobs, including queued, active, and completed */
    jobs: Record<string, RenderJobInternal>;
    /** Ordered queue of videoIds waiting to render */
    pendingQueue: string[];
    /** Currently rendering videoId (null if idle) */
    activeJobId: string | null;
}

interface RenderQueueActions {
    /** Add a render job — runs immediately if queue is empty, otherwise queues */
    startJob: (videoId: string, snapshot: RenderSnapshot) => void;
    /** Cancel a specific job (active or queued) */
    cancelJob: (videoId: string) => void;
    /** Remove a completed/cancelled/error job and free its blob URL */
    clearJob: (videoId: string) => void;
}

export const useRenderQueueStore = create<RenderQueueState & RenderQueueActions>(
    (set, get) => ({
        jobs: {},
        pendingQueue: [],
        activeJobId: null,

        startJob: (videoId, snapshot) => {
            const existing = get().jobs[videoId];
            // Don't start if already rendering or queued for this video
            if (existing?.status === 'rendering' || existing?.status === 'queued') return;

            const abortController = new AbortController();

            const job: RenderJobInternal = {
                videoId,
                status: 'queued',
                progress: 0,
                abortController,
                snapshot,
            };

            // Add job to store
            const state = get();
            const isIdle = state.activeJobId === null;

            if (isIdle) {
                // No active render → start immediately
                set((s) => ({
                    jobs: { ...s.jobs, [videoId]: { ...job, status: 'rendering' } },
                    activeJobId: videoId,
                }));
                executeJob(videoId);
            } else {
                // Queue it
                set((s) => ({
                    jobs: { ...s.jobs, [videoId]: job },
                    pendingQueue: [...s.pendingQueue, videoId],
                }));
            }
        },

        cancelJob: (videoId) => {
            const state = get();
            const job = state.jobs[videoId];
            if (!job) return;

            if (job.status === 'queued') {
                // Remove from queue, mark as cancelled
                set((s) => ({
                    jobs: {
                        ...s.jobs,
                        [videoId]: { ...s.jobs[videoId], status: 'cancelled', progress: 0 },
                    },
                    pendingQueue: s.pendingQueue.filter((id) => id !== videoId),
                }));
            } else if (job.status === 'rendering') {
                // Abort — the executeJob catch handler will dequeue next
                job.abortController.abort();
            }
        },

        clearJob: (videoId) => {
            const job = get().jobs[videoId];
            if (job?.blobUrl) URL.revokeObjectURL(job.blobUrl);
            set((s) => {
                const next = { ...s.jobs };
                delete next[videoId];
                return {
                    jobs: next,
                    pendingQueue: s.pendingQueue.filter((id) => id !== videoId),
                };
            });
        },
    }),
);

// ─── Internal: execute a single render job ─────────────────────────────

function executeJob(videoId: string): void {
    const state = useRenderQueueStore.getState();
    const job = state.jobs[videoId];
    if (!job) return;

    renderVideo({
        videoTitle: job.snapshot.videoTitle,
        imageUrl: job.snapshot.imageUrl,
        tracks: job.snapshot.tracks,
        resolution: job.snapshot.resolution,
        loopCount: job.snapshot.loopCount,
        volume: job.snapshot.volume,
        onProgress: (pct) => {
            const current = useRenderQueueStore.getState().jobs[videoId];
            if (!current || current.status !== 'rendering') return;
            useRenderQueueStore.setState((s) => ({
                jobs: {
                    ...s.jobs,
                    [videoId]: { ...s.jobs[videoId], progress: pct },
                },
            }));
        },
        abortSignal: job.abortController.signal,
    })
        .then((result) => {
            const blobUrl = URL.createObjectURL(result.blob);

            // Adaptive size calibration: store actual/estimated ratio
            calibrateSizeEstimate(result.blob.size, job.snapshot);

            useRenderQueueStore.setState((s) => ({
                jobs: {
                    ...s.jobs,
                    [videoId]: {
                        ...s.jobs[videoId],
                        status: 'complete',
                        progress: 100,
                        blobUrl,
                        fileName: result.fileName,
                    },
                },
            }));
            dequeueNext();
        })
        .catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
                useRenderQueueStore.setState((s) => ({
                    jobs: {
                        ...s.jobs,
                        [videoId]: {
                            ...s.jobs[videoId],
                            status: 'cancelled',
                            progress: 0,
                        },
                    },
                }));
            } else {
                useRenderQueueStore.setState((s) => ({
                    jobs: {
                        ...s.jobs,
                        [videoId]: {
                            ...s.jobs[videoId],
                            status: 'error',
                            progress: 0,
                            error: err instanceof Error ? err.message : 'Unknown error',
                        },
                    },
                }));
            }
            dequeueNext();
        });
}

// ─── Internal: process next queued job ─────────────────────────────────

function dequeueNext(): void {
    // Iterative loop — skips cancelled/cleared jobs without recursion
    while (true) {
        const state = useRenderQueueStore.getState();
        const { pendingQueue } = state;

        if (pendingQueue.length === 0) {
            useRenderQueueStore.setState({ activeJobId: null });
            return;
        }

        // Take the first queued job
        const nextVideoId = pendingQueue[0];
        const nextJob = state.jobs[nextVideoId];

        // Skip if it was cancelled/cleared while waiting
        if (!nextJob || nextJob.status !== 'queued') {
            useRenderQueueStore.setState((s) => ({
                pendingQueue: s.pendingQueue.slice(1),
            }));
            continue; // try the next one
        }

        // Start the next job
        useRenderQueueStore.setState((s) => ({
            jobs: {
                ...s.jobs,
                [nextVideoId]: { ...s.jobs[nextVideoId], status: 'rendering' },
            },
            pendingQueue: s.pendingQueue.slice(1),
            activeJobId: nextVideoId,
        }));

        executeJob(nextVideoId);
        return;
    }
}

// ─── Size estimation calibration ───────────────────────────────────────

const SIZE_RATIO_KEY = 'render-size-ratio';
const DEFAULT_RATIO = 1;
const EMA_ALPHA = 0.4; // Weight of new measurement vs history

/** Compute naive byte estimate (same formula as RenderControls) */
function naiveEstimateBytes(durationSec: number, resolution: RenderResolution): number {
    const videoBitrate = BITRATE_MAP[resolution];
    const audioBitrate = 384_000;
    const effectiveVideoBitrate = videoBitrate * 0.85;
    const containerOverhead = 1.05;
    return ((effectiveVideoBitrate + audioBitrate) * durationSec) / 8 * containerOverhead;
}

/** After render, record actual vs estimated ratio to calibrate future estimates */
function calibrateSizeEstimate(actualBytes: number, snapshot: RenderSnapshot): void {
    const totalTrackDuration = snapshot.tracks.reduce(
        (sum, t) => sum + getEffectiveDuration(t), 0,
    );
    const totalDuration = totalTrackDuration * snapshot.loopCount;
    if (totalDuration <= 0) return;

    const estimated = naiveEstimateBytes(totalDuration, snapshot.resolution);
    if (estimated <= 0) return;

    const newRatio = actualBytes / estimated;
    const prevRatio = getSizeCalibrationRatio();

    // Exponential moving average for smooth adaptation
    const blended = prevRatio === DEFAULT_RATIO
        ? newRatio // First measurement → use directly
        : EMA_ALPHA * newRatio + (1 - EMA_ALPHA) * prevRatio;

    try {
        localStorage.setItem(SIZE_RATIO_KEY, blended.toFixed(4));
    } catch { /* quota exceeded — ignore */ }
}

/** Read the stored calibration ratio (1.0 = no correction) */
export function getSizeCalibrationRatio(): number {
    try {
        const stored = localStorage.getItem(SIZE_RATIO_KEY);
        if (stored) {
            const val = parseFloat(stored);
            if (Number.isFinite(val) && val > 0) return val;
        }
    } catch { /* ignore */ }
    return DEFAULT_RATIO;
}
