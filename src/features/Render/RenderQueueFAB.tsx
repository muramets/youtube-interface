// =============================================================================
// Render Queue FAB — Global floating indicator for render progress
// =============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Film, X, Download, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/atoms/Button/Button';
import { useRenderQueueStore, type RenderJob } from '../../core/stores/renderQueueStore';
import { useFloatingBottomOffset } from '../../core/hooks/useFloatingBottomOffset';
import { RenderStatusBar } from '../../components/ui/atoms/RenderStatusBar';
import './RenderQueueFAB.css';

// ─── Progress ring SVG helper ──────────────────────────────────────────

const RING_SIZE = 40;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const ProgressRing: React.FC<{ progress: number }> = ({ progress }) => {
    const offset = RING_CIRCUMFERENCE - (progress / 100) * RING_CIRCUMFERENCE;
    return (
        <svg width={RING_SIZE} height={RING_SIZE} className="absolute inset-0 -rotate-90">
            {/* Background ring */}
            <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={RING_STROKE}
                className="text-border"
            />
            {/* Progress ring */}
            <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={RING_STROKE}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="text-accent render-progress-ring"
            />
        </svg>
    );
};

// ─── Main component ────────────────────────────────────────────────────

export const RenderQueueFAB: React.FC = () => {
    const allJobs = useRenderQueueStore((s) => s.jobs);
    const cancelJob = useRenderQueueStore((s) => s.cancelJob);
    const clearJob = useRenderQueueStore((s) => s.clearJob);
    const { bottomClass, rightClass } = useFloatingBottomOffset();

    const [isExpanded, setIsExpanded] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const autoClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Delayed fade-in (matching ChatBubble)
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setReady(true), 600);
        return () => clearTimeout(t);
    }, []);

    // Close panel on outside click
    useEffect(() => {
        if (!isExpanded) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isExpanded]);

    // Compute visible jobs (public shape — strip internal fields)
    const visibleJobs: RenderJob[] = useMemo(() =>
        Object.values(allJobs).map((j) => ({
            videoId: j.videoId,
            status: j.status,
            progress: j.progress,
            error: j.error,
            blobUrl: j.blobUrl,
            fileName: j.fileName,
        })),
        [allJobs]);

    // Stable dependency key for auto-clear effect
    const jobKey = useMemo(() =>
        visibleJobs.map((j) => `${j.videoId}:${j.status}`).join(','),
        [visibleJobs]);

    // Auto-clear cancelled jobs after 30s (complete/error jobs persist until dismissed)
    useEffect(() => {
        const jobs = Object.values(useRenderQueueStore.getState().jobs);
        const currentJobIds = new Set(jobs.map((j) => j.videoId));

        for (const job of jobs) {
            if (job.status === 'cancelled' && !autoClearTimers.current.has(job.videoId)) {
                autoClearTimers.current.set(
                    job.videoId,
                    setTimeout(() => {
                        autoClearTimers.current.delete(job.videoId);
                        clearJob(job.videoId);
                    }, 30_000),
                );
            }
        }

        // Clean up timers for jobs that were manually cleared by the user
        for (const [videoId, timer] of autoClearTimers.current) {
            if (!currentJobIds.has(videoId)) {
                clearTimeout(timer);
                autoClearTimers.current.delete(videoId);
            }
        }
    }, [jobKey, clearJob]);

    // Clean up all timers on unmount
    useEffect(() => {
        const timers = autoClearTimers.current;
        return () => {
            timers.forEach(clearTimeout);
            timers.clear();
        };
    }, []);

    // Don't render if no jobs
    if (visibleJobs.length === 0) return null;

    const activeJob = visibleJobs.find((j) => j.status === 'rendering');
    const queuedCount = visibleJobs.filter((j) => j.status === 'queued').length;

    // Position: left of ChatBubble (chat is right-8 = 2rem, width 3rem, gap 0.75rem)
    // → render FAB at right-8 + 3rem + 0.75rem = right-[5.75rem]
    // On trends page: ChatBubble is at right-[70px], so FAB at right-[70px + 3rem + 0.75rem]
    // We use a simpler approach: offset by 60px from ChatBubble's right edge
    const fabRightClass = rightClass === 'right-8'
        ? 'right-[5.75rem]'
        : 'right-[130px]'; // 70px + 60px

    return (
        <div ref={panelRef} className="fixed z-sticky" style={{ opacity: ready ? 1 : 0, pointerEvents: ready ? undefined : 'none' }}>
            {/* ── Expanded panel ─────────────────────────────────────── */}
            {isExpanded && (
                <div
                    className={`render-queue-panel fixed ${fabRightClass} ${bottomClass} mb-14 w-72 rounded-xl border border-border bg-bg-secondary/95 backdrop-blur-md shadow-xl overflow-hidden transition-[bottom] duration-500`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                        <span className="text-xs font-semibold text-text-primary">Render Queue</span>
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="p-0.5 rounded hover:bg-hover text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <ChevronUp size={14} />
                        </button>
                    </div>

                    {/* Job list */}
                    <div className="max-h-60 overflow-y-auto">
                        {visibleJobs.map((job) => (
                            <RenderJobRow
                                key={job.videoId}
                                job={job}
                                onCancel={() => cancelJob(job.videoId)}
                                onClear={() => clearJob(job.videoId)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Collapsed FAB ──────────────────────────────────────── */}
            <button
                className={`render-fab fixed ${fabRightClass} ${bottomClass} h-10 rounded-full border border-border cursor-pointer flex items-center gap-2 bg-bg-secondary/90 backdrop-blur-md shadow-lg text-text-secondary transition-[bottom,transform,filter,opacity] duration-500 hover:brightness-125 ${activeJob ? 'pl-0 pr-3' : 'px-3'
                    }`}
                onClick={() => setIsExpanded(!isExpanded)}
                title="Render Queue"
            >
                {activeJob ? (
                    <>
                        <span className="text-xs font-medium whitespace-nowrap tabular-nums">
                            {Math.round(activeJob.progress)}%
                            {queuedCount > 0 && (
                                <span className="text-text-tertiary ml-1">+{queuedCount}</span>
                            )}
                        </span>
                        {/* Progress ring with icon inside */}
                        <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
                            <ProgressRing progress={activeJob.progress} />
                            <Film className="w-4 h-4" />
                        </div>
                    </>
                ) : (
                    <>
                        <Film className="w-4 h-4" />
                        <span className="text-xs font-medium">
                            {visibleJobs.length} {visibleJobs.length === 1 ? 'render' : 'renders'}
                        </span>
                    </>
                )}
            </button>
        </div>
    );
};

// ─── Individual job row in expanded panel ──────────────────────────────

interface RenderJobRowProps {
    job: RenderJob;
    onCancel: () => void;
    onClear: () => void;
}

const RenderJobRow: React.FC<RenderJobRowProps> = ({ job, onCancel, onClear }) => {
    const { videoId, status, progress, error, blobUrl, fileName } = job;
    const truncatedId = videoId.length > 12 ? `${videoId.slice(0, 12)}…` : videoId;

    return (
        <div className="px-3 py-2.5 border-b border-border/50 last:border-b-0">
            {/* Row header */}
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-text-secondary truncate max-w-[140px]" title={videoId}>
                    {truncatedId}
                </span>
                <div className="flex items-center gap-1.5">
                    {(status === 'rendering' || status === 'queued') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCancel}
                            className="!h-auto !px-1.5 !py-0.5 !text-[10px]"
                        >
                            Cancel
                        </Button>
                    )}
                    {status === 'complete' && blobUrl && (
                        <a
                            href={blobUrl}
                            download={fileName || 'render.mp4'}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-[#3ea6ff] hover:bg-[#3ea6ff]/10 transition-colors"
                        >
                            <Download size={10} />
                            Save
                        </a>
                    )}
                    {status !== 'rendering' && status !== 'queued' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClear}
                            className="!h-auto !p-0.5"
                        >
                            <X size={12} />
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <RenderStatusBar status={status} progress={progress} heightClass="h-1" bgClass="bg-bg-primary" />

            {/* Status line */}
            <div className="mt-1 flex items-center gap-1">
                {status === 'rendering' && <Loader2 size={10} className="animate-spin text-accent" />}
                <span className={`text-[10px] ${status === 'error' ? 'text-red-400'
                    : status === 'complete' ? 'text-green-400'
                        : status === 'cancelled' ? 'text-yellow-400'
                            : 'text-text-tertiary'
                    }`}>
                    {status === 'queued' && 'Queued'}
                    {status === 'rendering' && `Rendering ${Math.round(progress)}%`}
                    {status === 'complete' && 'Complete'}
                    {status === 'error' && (error || 'Failed')}
                    {status === 'cancelled' && 'Cancelled'}
                </span>
            </div>
        </div>
    );
};
