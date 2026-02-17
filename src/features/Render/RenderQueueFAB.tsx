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

// ─── Pill-contour progress overlay ─────────────────────────────────────

const PILL_STROKE = 2.5;

/** Draws progress along the outer contour of the pill-shaped button using fixed positioning. */
const PillProgress: React.FC<{ progress: number; containerRef: React.RefObject<HTMLElement | null> }> = ({ progress, containerRef }) => {
    const [size, setSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const measure = () => {
            const { width, height } = el.getBoundingClientRect();
            setSize((prev) =>
                prev.w === width && prev.h === height
                    ? prev
                    : { w: width, h: height }
            );
        };
        measure();

        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener('resize', measure);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [containerRef]);

    if (size.w === 0 || size.h === 0) return null;

    const { w, h } = size;
    const r = h / 2;
    const perimeter = 2 * (w - 2 * r) + 2 * Math.PI * r;
    const offset = perimeter - (progress / 100) * perimeter;
    const inset = PILL_STROKE / 2;
    const rr = r - inset;

    const d = [
        `M ${w / 2} ${inset}`,
        `L ${w - inset - rr} ${inset}`,
        `A ${rr} ${rr} 0 0 1 ${w - inset} ${h / 2}`,
        `A ${rr} ${rr} 0 0 1 ${w - inset - rr} ${h - inset}`,
        `L ${inset + rr} ${h - inset}`,
        `A ${rr} ${rr} 0 0 1 ${inset} ${h / 2}`,
        `A ${rr} ${rr} 0 0 1 ${inset + rr} ${inset}`,
        `Z`,
    ].join(' ');

    return (
        <svg
            className="absolute inset-0 pointer-events-none"
            width={w}
            height={h}
        >
            <path
                d={d}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={PILL_STROKE}
                strokeDasharray={perimeter}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="render-progress-ring"
            />
        </svg>
    );
};

// ─── Main component ────────────────────────────────────────────────────

export const RenderQueueFAB: React.FC = () => {
    const allJobs = useRenderQueueStore((s) => s.jobs);
    const cancelJob = useRenderQueueStore((s) => s.cancelJob);
    const clearJob = useRenderQueueStore((s) => s.clearJob);
    const { bottomClass, rightPx } = useFloatingBottomOffset();

    const [isExpanded, setIsExpanded] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
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

    // Position FAB to the left of ChatBubble: chatBubble right + chatBubble width (48px) + gap (12px)
    const fabRightPx = rightPx + 60;

    return (
        <div ref={panelRef} className="fixed z-sticky" style={{ opacity: ready ? 1 : 0, pointerEvents: ready ? undefined : 'none' }}>
            {/* ── Expanded panel ─────────────────────────────────────── */}
            {isExpanded && (
                <div
                    className={`render-queue-panel fixed ${bottomClass} mb-16 w-72 rounded-xl border border-border bg-bg-secondary/70 backdrop-blur-xl shadow-xl overflow-hidden transition-[bottom] duration-500`}
                    style={{ right: fabRightPx }}
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
                ref={fabRef}
                className={`render-fab fixed ${bottomClass} h-12 rounded-full border border-border cursor-pointer flex items-center gap-2.5 px-4 bg-bg-secondary/70 backdrop-blur-xl shadow-lg text-text-secondary transition-[bottom,transform,filter,opacity] duration-500 hover:brightness-125`}
                style={{ right: fabRightPx }}
                onClick={() => setIsExpanded(!isExpanded)}
                title="Render Queue"
            >
                {activeJob && <PillProgress progress={activeJob.progress} containerRef={fabRef} />}
                {activeJob ? (
                    <span className="text-xs font-semibold tabular-nums w-10 text-left">
                        {Math.round(activeJob.progress)}%
                        {queuedCount > 0 && (
                            <span className="text-text-tertiary ml-0.5">+{queuedCount}</span>
                        )}
                    </span>
                ) : (
                    <span className="text-xs font-medium">
                        {visibleJobs.length} {visibleJobs.length === 1 ? 'render' : 'renders'}
                    </span>
                )}

                <Film className="w-5 h-5 flex-shrink-0" />
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
    const displayName = fileName
        ? fileName.replace(/\.\w+$/, '')
        : (videoId.length > 12 ? `${videoId.slice(0, 12)}…` : videoId);

    return (
        <div className="px-3 py-2.5 border-b border-border/50 last:border-b-0">
            {/* Row header */}
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-text-secondary truncate max-w-[140px]" title={fileName || videoId}>
                    {displayName}
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
