import { create } from 'zustand';
import { startServerRender, cancelServerRender, deleteServerRender, sanitizeFilename, BITRATE_MAP } from '../../../pages/Details/tabs/Editing/services/renderService';
import type { RenderResolution, TimelineTrack } from '../../types/editing';
import { collection, doc, getDocs, onSnapshot, orderBy, query, limit, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { parseFirestoreTimestamp } from '../../utils/firestoreUtils';

// ─── Render job types ──────────────────────────────────────────────────

export type RenderJobStatus =
    | 'queued'
    | 'rendering'
    | 'complete'
    | 'failed_to_start'  // Cloud Function call failed (network, auth, validation)
    | 'cancelled'
    | 'render_failed';   // Cloud Run Job crashed (ffmpeg error, OOM, disk full)

export interface RenderJob {
    videoId: string;
    status: RenderJobStatus;
    progress: number;       // 0–100
    stage?: string;         // starting | stalled | downloading | encoding | uploading | finalizing
    error?: string;
    /** R2 signed download URL (from server) */
    downloadUrl?: string;
    fileName?: string;
    /** Firestore render document path (for progress tracking) */
    renderDocPath?: string;
    renderId?: string;
    /** Timestamp when R2 file expires (auto-deleted). Used for UI lifecycle. */
    expiresAt?: number;
    /** If true, job was dismissed from FAB but still visible in editing tab */
    dismissedFromFab?: boolean;
    /** Client-side timestamp for stall detection */
    startedAt?: number;
    /** Total render duration in seconds (computed from Firestore, survives refresh) */
    renderDurationSecs?: number;
}

interface RenderJobInternal extends RenderJob {
    snapshot: RenderSnapshot;
    /** Firestore onSnapshot unsubscribe function */
    unsubscribe?: (() => void);
    /** Stall watchdog timer ID */
    stallTimerId?: ReturnType<typeof setTimeout>;
}

// ─── Snapshot of everything needed to render (decoupled from editingStore) ──

export interface RenderSnapshot {
    videoTitle: string;
    imageUrl: string;
    channelId: string;
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
    /** Adaptive size calibration ratio (EMA of actual/predicted file size) */
    sizeCalibrationRatio: number;
    /** User ID for which calibration ratio was loaded (prevents re-fetching) */
    sizeCalibrationUserId: string | null;
}

interface RenderQueueActions {
    /** Add a render job — calls Cloud Function immediately */
    startJob: (videoId: string, snapshot: RenderSnapshot) => void;
    /** Cancel a specific job (active or queued) */
    cancelJob: (videoId: string) => void;
    /** Retry a failed job using its stored snapshot */
    retryJob: (videoId: string) => void;
    /** Remove a completed/cancelled/error job from everywhere */
    clearJob: (videoId: string) => void;
    /** Permanently delete a render (R2 file + Firestore doc + store) */
    deleteJob: (videoId: string) => Promise<void>;
    /** Dismiss from FAB only — keep in editing tab until expiry */
    dismissFromFab: (videoId: string) => void;
    /** Remove expired jobs (called periodically and on app load) */
    cleanExpired: () => void;
    /** Hydrate completed/active renders from Firestore (survives page refresh) */
    hydrateFromFirestore: (userId: string, channelId: string, videoId: string) => Promise<void>;
}



export const useRenderQueueStore = create<RenderQueueState & RenderQueueActions>(
    (set, get) => ({
        jobs: {},
        pendingQueue: [],
        activeJobId: null,
        sizeCalibrationRatio: 1,
        sizeCalibrationUserId: null,

        startJob: (videoId, snapshot) => {
            const existing = get().jobs[videoId];
            // Don't start if already rendering or queued for this video
            if (existing?.status === 'rendering' || existing?.status === 'queued') return;

            const job: RenderJobInternal = {
                videoId,
                status: 'queued',
                progress: 0,
                startedAt: Date.now(),
                snapshot,
            };

            // Add job to store and start
            const state = get();
            const isIdle = state.activeJobId === null;

            if (isIdle) {
                // No active render → start immediately
                set((s) => ({
                    jobs: { ...s.jobs, [videoId]: { ...job, status: 'rendering' } },
                    activeJobId: videoId,
                }));
                executeServerRender(videoId);
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

            // Clean up listeners and timers
            job.unsubscribe?.();
            clearStallTimer(videoId);

            if (job.status === 'queued') {
                set((s) => ({
                    jobs: {
                        ...s.jobs,
                        [videoId]: { ...s.jobs[videoId], status: 'cancelled', progress: 0 },
                    },
                    pendingQueue: s.pendingQueue.filter((id) => id !== videoId),
                }));
            } else if (job.status === 'rendering') {
                // Signal the server to cancel the Cloud Run Job
                if (job.renderId && job.snapshot.channelId) {
                    cancelServerRender({
                        channelId: job.snapshot.channelId,
                        videoId,
                        renderId: job.renderId,
                    }).catch((err: unknown) => console.error('[renderQueue] cancel failed:', err));
                }

                set((s) => {
                    // Atomically cancel + dequeue next to avoid activeJobId gap
                    const queue = s.pendingQueue;
                    let nextActiveId: string | null = null;
                    let nextQueue = queue;
                    const nextJobs = {
                        ...s.jobs,
                        [videoId]: { ...s.jobs[videoId], status: 'cancelled' as const, progress: 0 },
                    };

                    // Find the next valid queued job
                    while (nextQueue.length > 0) {
                        const candidateId = nextQueue[0];
                        const candidate = nextJobs[candidateId];
                        if (candidate && candidate.status === 'queued') {
                            nextActiveId = candidateId;
                            nextJobs[candidateId] = { ...candidate, status: 'rendering' as const };
                            nextQueue = nextQueue.slice(1);
                            break;
                        }
                        nextQueue = nextQueue.slice(1);
                    }

                    return {
                        jobs: nextJobs,
                        activeJobId: nextActiveId,
                        pendingQueue: nextQueue,
                    };
                });

                // If a next job was promoted, start it (outside set() to avoid side-effects in reducer)
                const nextActive = get().activeJobId;
                if (nextActive) {
                    executeServerRender(nextActive);
                }
            }
        },

        retryJob: (videoId) => {
            const job = get().jobs[videoId];
            if (!job) return;
            if (job.status !== 'failed_to_start' && job.status !== 'render_failed') return;

            // Clean up old job, then re-enqueue with the same snapshot
            job.unsubscribe?.();
            set((s) => {
                const next = { ...s.jobs };
                delete next[videoId];
                return { jobs: next };
            });
            get().startJob(videoId, job.snapshot);
        },

        clearJob: (videoId) => {
            const job = get().jobs[videoId];
            job?.unsubscribe?.();
            set((s) => {
                const next = { ...s.jobs };
                delete next[videoId];
                return {
                    jobs: next,
                    pendingQueue: s.pendingQueue.filter((id) => id !== videoId),
                };
            });
        },

        deleteJob: async (videoId) => {
            const job = get().jobs[videoId];
            if (!job) return;

            const channelId = job.snapshot.channelId;
            const renderId = job.renderId;

            // Optimistic update: remove from UI immediately
            job.unsubscribe?.();
            const savedJob = { ...job };
            set((s) => {
                const next = { ...s.jobs };
                delete next[videoId];
                return {
                    jobs: next,
                    pendingQueue: s.pendingQueue.filter((id) => id !== videoId),
                };
            });
            // Clean from localStorage dismissed set
            try {
                const key = 'renderQueue_dismissedFromFab';
                const dismissed: string[] = JSON.parse(localStorage.getItem(key) || '[]');
                const filtered = dismissed.filter((id) => id !== videoId);
                localStorage.setItem(key, JSON.stringify(filtered));
            } catch { /* localStorage unavailable */ }

            // Await Cloud Function — rollback on failure
            if (channelId && renderId) {
                try {
                    await deleteServerRender({ channelId, videoId, renderId });
                } catch (err) {
                    console.error('[renderQueue] deleteServerRender failed, rolling back:', err);
                    // Rollback: re-add job only if no new job was created for this videoId
                    set((s) => {
                        if (s.jobs[videoId]) return s; // new job exists — don't overwrite
                        return { jobs: { ...s.jobs, [videoId]: savedJob } };
                    });
                }
            }
        },

        dismissFromFab: (videoId) => {
            set((s) => {
                const job = s.jobs[videoId];
                if (!job) return s;
                return {
                    jobs: {
                        ...s.jobs,
                        [videoId]: { ...job, dismissedFromFab: true },
                    },
                };
            });
            // Persist dismissed IDs to localStorage so it survives page refresh
            try {
                const key = 'renderQueue_dismissedFromFab';
                const dismissed: string[] = JSON.parse(localStorage.getItem(key) || '[]');
                if (!dismissed.includes(videoId)) {
                    dismissed.push(videoId);
                    localStorage.setItem(key, JSON.stringify(dismissed));
                }
            } catch { /* localStorage unavailable */ }
        },

        cleanExpired: () => {
            const now = Date.now();
            set((s) => {
                const next = { ...s.jobs };
                let changed = false;
                for (const [vid, job] of Object.entries(next)) {
                    if (job.expiresAt && job.expiresAt <= now && job.status === 'complete') {
                        job.unsubscribe?.();
                        delete next[vid];
                        changed = true;
                    }
                }
                return changed ? { jobs: next } : s;
            });
        },

        hydrateFromFirestore: async (userId, channelId, videoId) => {
            // Skip if we already have this job in memory
            if (get().jobs[videoId]) return;

            try {
                const rendersRef = collection(
                    db,
                    `users/${userId}/channels/${channelId}/videos/${videoId}/renders`,
                );

                // Read dismissed-from-FAB set from localStorage
                let dismissedSet: Set<string>;
                try {
                    dismissedSet = new Set(JSON.parse(localStorage.getItem('renderQueue_dismissedFromFab') || '[]'));
                } catch { dismissedSet = new Set(); }

                // Load calibration ratio on first access
                await loadSizeCalibration(userId);

                // Two-pass hydration:
                // 1. Active/cancelled renders (no completedAt → invisible to orderBy)
                // 2. Fall back to latest completed render
                const activeQ = query(
                    rendersRef,
                    where('status', 'in', ['rendering', 'queued', 'cancelled']),
                    limit(1),
                );
                let snap = await getDocs(activeQ);

                if (snap.empty) {
                    // No active render — check for most recent completed
                    const completedQ = query(rendersRef, orderBy('completedAt', 'desc'), limit(1));
                    snap = await getDocs(completedQ);
                }

                if (snap.empty) return;

                const renderDoc = snap.docs[0];
                const data = renderDoc.data();
                const status = data.status as string;

                // Skip expired completed renders
                const expiresAt = parseFirestoreTimestamp(data.expiresAt);
                if (status === 'complete' && expiresAt && expiresAt < Date.now()) return;

                // Build snapshot from Firestore data (videoTitle/resolution stored inside params by startRender)
                const params = (data.params as Record<string, unknown>) || {};
                const videoTitle = (params.videoTitle as string) || (data.videoTitle as string) || '';
                const resolution = (params.resolution as string) || '1080p';
                const placeholderSnapshot: RenderSnapshot = {
                    videoTitle,
                    imageUrl: '',
                    channelId,
                    tracks: [],
                    resolution: resolution as RenderResolution,
                    loopCount: 1,
                    volume: 1,
                };

                const renderDocPath = renderDoc.ref.path;
                const renderId = renderDoc.id;

                if (status === 'complete') {
                    // Compute render duration from Firestore timestamps
                    const startedAtRaw = data.startedAt;
                    const completedAtRaw = data.completedAt;
                    const startMs = startedAtRaw?.toMillis?.() ?? (startedAtRaw instanceof Date ? startedAtRaw.getTime() : undefined);
                    const endMs = completedAtRaw?.toMillis?.() ?? (completedAtRaw instanceof Date ? completedAtRaw.getTime() : undefined);
                    const renderDurationSecs = startMs && endMs ? Math.floor((endMs - startMs) / 1000) : undefined;

                    // Hydrate completed render (download link + expiry)
                    set((s) => ({
                        jobs: {
                            ...s.jobs,
                            [videoId]: {
                                videoId,
                                status: 'complete',
                                progress: 100,
                                downloadUrl: data.downloadUrl,
                                fileName: `${sanitizeFilename(videoTitle || 'render')}_${resolution}.mp4`,
                                renderDocPath,
                                renderId,
                                expiresAt,
                                renderDurationSecs,
                                snapshot: placeholderSnapshot,
                                dismissedFromFab: dismissedSet.has(videoId),
                            },
                        },
                    }));
                } else if (status === 'rendering' || status === 'queued') {
                    // Hydrate active render and re-subscribe to progress
                    set((s) => ({
                        jobs: {
                            ...s.jobs,
                            [videoId]: {
                                videoId,
                                status: status as RenderJobStatus,
                                progress: (data.progress as number) || 0,
                                stage: (data.stage as string) || undefined,
                                renderDocPath,
                                renderId,
                                snapshot: placeholderSnapshot,
                                dismissedFromFab: dismissedSet.has(videoId),
                            },
                        },
                        activeJobId: status === 'rendering' ? videoId : s.activeJobId,
                    }));
                    // Re-subscribe to live progress
                    subscribeToRenderProgress(videoId, renderDocPath);
                } else if (status === 'cancelled') {
                    // Persist cancelled renders so user can see them + delete via trash
                    set((s) => ({
                        jobs: {
                            ...s.jobs,
                            [videoId]: {
                                videoId,
                                status: 'cancelled' as RenderJobStatus,
                                progress: 0,
                                renderDocPath,
                                renderId,
                                snapshot: placeholderSnapshot,
                            },
                        },
                    }));
                } else if (status === 'render_failed' || status === 'failed_to_start') {
                    // Show the error so user can see what happened
                    set((s) => ({
                        jobs: {
                            ...s.jobs,
                            [videoId]: {
                                videoId,
                                status: status as RenderJobStatus,
                                progress: 0,
                                error: data.error || 'Render failed',
                                renderDocPath,
                                renderId,
                                snapshot: placeholderSnapshot,
                            },
                        },
                    }));
                }
            } catch (err) {
                console.error('[renderQueue] hydration failed:', err);
            }
        },
    }),
);

// ─── Internal: execute a server render ─────────────────────────────────

async function executeServerRender(videoId: string): Promise<void> {
    const state = useRenderQueueStore.getState();
    const job = state.jobs[videoId];
    if (!job) return;

    try {
        // Set stage to 'starting' so UI shows "Starting server..." immediately
        useRenderQueueStore.setState((s) => ({
            jobs: {
                ...s.jobs,
                [videoId]: {
                    ...s.jobs[videoId],
                    stage: 'starting',
                },
            },
        }));

        // Validate all tracks have storage paths
        const tracksForServer = job.snapshot.tracks.map((t) => {
            if (!t.audioStoragePath) {
                throw new Error(`Track "${t.title}" missing audioStoragePath`);
            }
            return {
                audioStoragePath: t.audioStoragePath,
                volume: t.volume,
                trimStart: t.trimStart,
                trimEnd: t.trimEnd,
                duration: t.duration,
                title: t.title,
            };
        });

        if (!job.snapshot.imageUrl) {
            throw new Error('Image URL is required for server render');
        }

        // Call Cloud Function
        const result = await startServerRender({
            channelId: job.snapshot.channelId,
            videoId,
            videoTitle: job.snapshot.videoTitle,
            imageUrl: job.snapshot.imageUrl,
            tracks: tracksForServer,
            resolution: job.snapshot.resolution,
            loopCount: job.snapshot.loopCount,
            masterVolume: job.snapshot.volume,
        });

        // Update job with renderId and renderDocPath
        useRenderQueueStore.setState((s) => ({
            jobs: {
                ...s.jobs,
                [videoId]: {
                    ...s.jobs[videoId],
                    renderId: result.renderId,
                    renderDocPath: result.renderDocPath,
                },
            },
        }));

        // Start listening for Firestore progress updates
        subscribeToRenderProgress(videoId, result.renderDocPath);

    } catch (err) {
        useRenderQueueStore.setState((s) => ({
            jobs: {
                ...s.jobs,
                [videoId]: {
                    ...s.jobs[videoId],
                    status: 'failed_to_start',
                    progress: 0,
                    error: err instanceof Error ? err.message : 'Failed to start render',
                },
            },
            activeJobId: null,
        }));
        dequeueNext();
    }
}

// ─── Stall watchdog ────────────────────────────────────────────────────

const STALL_SOFT_TIMEOUT_MS = 90_000;   // 90s → show "Taking longer than expected..."
const STALL_HARD_TIMEOUT_MS = 300_000;  // 5min → auto-fail

/** Clear the stall watchdog timer for a job (idempotent). */
function clearStallTimer(videoId: string): void {
    const job = useRenderQueueStore.getState().jobs[videoId];
    if (job?.stallTimerId) {
        clearTimeout(job.stallTimerId);
        useRenderQueueStore.setState((s) => ({
            jobs: { ...s.jobs, [videoId]: { ...s.jobs[videoId], stallTimerId: undefined } },
        }));
    }
}

/**
 * Start a two-phase watchdog timer for a render job:
 * - Phase 1 (90s): soft warning — stage → 'stalled'
 * - Phase 2 (5min): hard fail  — status → 'render_failed'
 */
function startStallWatchdog(videoId: string): void {
    // Phase 1: soft warning
    const preRenderStages = new Set(['starting', 'initializing', 'loading_params']);
    const softTimer = setTimeout(() => {
        const job = useRenderQueueStore.getState().jobs[videoId];
        if (!job || job.status !== 'rendering' || !preRenderStages.has(job.stage || '')) return;

        // Transition to stalled (soft warning)
        useRenderQueueStore.setState((s) => ({
            jobs: {
                ...s.jobs,
                [videoId]: { ...s.jobs[videoId], stage: 'stalled' },
            },
        }));

        // Phase 2: hard fail after remaining time
        const hardTimer = setTimeout(() => {
            const current = useRenderQueueStore.getState().jobs[videoId];
            if (!current || current.status !== 'rendering') return;
            // Only fail if still stalled (not progressing)
            if (current.stage !== 'stalled') return;

            current.unsubscribe?.();
            useRenderQueueStore.setState((s) => ({
                jobs: {
                    ...s.jobs,
                    [videoId]: {
                        ...s.jobs[videoId],
                        status: 'render_failed',
                        progress: 0,
                        error: 'Server did not respond — please try again',
                        stallTimerId: undefined,
                    },
                },
                activeJobId: null,
            }));
            dequeueNext();
        }, STALL_HARD_TIMEOUT_MS - STALL_SOFT_TIMEOUT_MS);

        // Store the hard timer ID so it can be cleared
        useRenderQueueStore.setState((s) => ({
            jobs: { ...s.jobs, [videoId]: { ...s.jobs[videoId], stallTimerId: hardTimer } },
        }));
    }, STALL_SOFT_TIMEOUT_MS);

    // Store the soft timer ID
    useRenderQueueStore.setState((s) => ({
        jobs: { ...s.jobs, [videoId]: { ...s.jobs[videoId], stallTimerId: softTimer } },
    }));
}

// ─── Firestore progress listener ───────────────────────────────────────

function subscribeToRenderProgress(videoId: string, renderDocPath: string): void {
    // Start stall detection timer
    startStallWatchdog(videoId);

    const unsubscribe = onSnapshot(
        doc(db, renderDocPath),
        (docSnap) => {
            if (!docSnap.exists()) return;
            const data = docSnap.data();
            const currentJob = useRenderQueueStore.getState().jobs[videoId];
            if (!currentJob) {
                unsubscribe();
                return;
            }

            // Don't update if locally cancelled
            if (currentJob.status === 'cancelled') {
                unsubscribe();
                return;
            }

            const serverStatus = data.status as string;

            // Server responded — cancel stall watchdog (it's alive!)
            clearStallTimer(videoId);
            const progress = (data.progress as number) || 0;

            if (serverStatus === 'complete') {
                const snapshot = currentJob.snapshot;
                const fileName = `${sanitizeFilename(snapshot.videoTitle)}_${snapshot.resolution}.mp4`;

                // Parse expiresAt from server
                const expiresAt = parseFirestoreTimestamp(data.expiresAt);

                useRenderQueueStore.setState((s) => {
                    // Re-check: if locally cancelled between getState and setState, skip
                    if (s.jobs[videoId]?.status === 'cancelled') return s;
                    return {
                        jobs: {
                            ...s.jobs,
                            [videoId]: {
                                ...s.jobs[videoId],
                                status: 'complete',
                                progress: 100,
                                downloadUrl: data.downloadUrl,
                                fileName,
                                expiresAt,
                            },
                        },
                    };
                });

                // Update size estimation calibration with actual server data
                const fileSizeBytes = data.fileSizeBytes as number | undefined;
                if (fileSizeBytes && fileSizeBytes > 0) {
                    // Extract userId from renderDocPath: users/{userId}/channels/...
                    const pathUserId = currentJob.renderDocPath?.split('/')[1];
                    if (pathUserId) {
                        updateSizeCalibration(snapshot, fileSizeBytes, pathUserId);
                    }
                }

                unsubscribe();
                dequeueNext();

            } else if (serverStatus === 'render_failed') {
                useRenderQueueStore.setState((s) => {
                    if (s.jobs[videoId]?.status === 'cancelled') return s;
                    return {
                        jobs: {
                            ...s.jobs,
                            [videoId]: {
                                ...s.jobs[videoId],
                                status: 'render_failed',
                                progress: 0,
                                error: data.error || 'Server render failed',
                            },
                        },
                    };
                });
                unsubscribe();
                dequeueNext();

            } else if (serverStatus === 'rendering') {
                useRenderQueueStore.setState((s) => {
                    if (s.jobs[videoId]?.status === 'cancelled') return s;
                    return {
                        jobs: {
                            ...s.jobs,
                            [videoId]: {
                                ...s.jobs[videoId],
                                status: 'rendering',
                                progress,
                                stage: (data.stage as string) || undefined,
                            },
                        },
                    };
                });
            } else if (serverStatus === 'queued') {
                // Server may update stage (initializing, loading_params) while
                // still in 'queued' status — pass through to UI so user sees
                // "Starting render engine..." during Cloud Run cold start
                const serverStage = data.stage as string | undefined;
                if (serverStage) {
                    useRenderQueueStore.setState((s) => {
                        if (s.jobs[videoId]?.status === 'cancelled') return s;
                        return {
                            jobs: {
                                ...s.jobs,
                                [videoId]: {
                                    ...s.jobs[videoId],
                                    status: 'rendering',
                                    stage: serverStage,
                                },
                            },
                        };
                    });
                }
            }
        },
        (error) => {
            console.error(`[renderQueue] Firestore listener error for ${videoId}:`, error);
            useRenderQueueStore.setState((s) => ({
                jobs: {
                    ...s.jobs,
                    [videoId]: {
                        ...s.jobs[videoId],
                        status: 'failed_to_start',
                        error: 'Lost connection to render server',
                    },
                },
            }));
            dequeueNext();
        },
    );

    // Store unsubscribe function for cleanup
    useRenderQueueStore.setState((s) => ({
        jobs: {
            ...s.jobs,
            [videoId]: { ...s.jobs[videoId], unsubscribe },
        },
    }));
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

        executeServerRender(nextVideoId);
        return;
    }
}

// ─── Size estimation calibration ───────────────────────────────────────

/** Read the cached calibration ratio (sync — loaded from Firestore on hydration) */
export function getSizeCalibrationRatio(): number {
    return useRenderQueueStore.getState().sizeCalibrationRatio;
}

/** Load calibration ratio from Firestore into store */
export async function loadSizeCalibration(userId: string): Promise<void> {
    if (useRenderQueueStore.getState().sizeCalibrationUserId === userId) return;
    try {
        const { getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, `users/${userId}/settings`, 'render'));
        if (snap.exists()) {
            const val = snap.data().sizeCalibrationRatio;
            if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
                useRenderQueueStore.setState({ sizeCalibrationRatio: val });
            }
        }
        useRenderQueueStore.setState({ sizeCalibrationUserId: userId });
    } catch { /* ignore — calibration is best-effort */ }
}

/** Update calibration ratio after a server render completes */
function updateSizeCalibration(snapshot: RenderSnapshot, actualBytes: number, userId: string): void {
    try {
        const videoBitrate = BITRATE_MAP[snapshot.resolution] || 8_000_000;
        const audioBitrate = 384_000;
        const effectiveVideoBitrate = videoBitrate * 0.85;
        const containerOverhead = 1.05;

        // Calculate total duration from snapshot tracks
        let totalDuration = 0;
        for (let loop = 0; loop < snapshot.loopCount; loop++) {
            for (const track of snapshot.tracks) {
                totalDuration += track.duration - track.trimStart - track.trimEnd;
            }
        }
        if (totalDuration <= 0) return;

        const predictedBytes = ((effectiveVideoBitrate + audioBitrate) * totalDuration) / 8 * containerOverhead;
        if (predictedBytes <= 0) return;

        const newRatio = actualBytes / predictedBytes;
        // Exponential moving average (α = 0.3): recent renders matter more
        const currentRatio = useRenderQueueStore.getState().sizeCalibrationRatio;
        const blended = currentRatio * 0.7 + newRatio * 0.3;
        useRenderQueueStore.setState({ sizeCalibrationRatio: blended });

        // Persist to Firestore (fire-and-forget)
        import('firebase/firestore').then(({ setDoc }) => {
            setDoc(doc(db, `users/${userId}/settings`, 'render'), {
                sizeCalibrationRatio: blended,
            }, { merge: true }).catch(() => { /* ignore */ });
        });
    } catch { /* ignore — calibration is best-effort */ }
}
