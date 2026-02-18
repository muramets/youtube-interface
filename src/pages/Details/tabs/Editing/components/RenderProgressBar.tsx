import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';
import { useRenderQueueStore } from '../../../../../core/stores/renderQueueStore';
import { RenderStatusBar } from '../../../../../components/ui/atoms/RenderStatusBar';
import { getRenderStatusDisplay, getUserFriendlyError } from '../../../../../features/Render/getRenderStageDisplay';
import { useElapsedTimer, formatElapsed } from '../../../../../features/Render/useElapsedTimer';
import { useShallow } from 'zustand/react/shallow';

interface RenderProgressBarProps {
    videoId: string;
}

export const RenderProgressBar: React.FC<RenderProgressBarProps> = ({ videoId }) => {
    const job = useRenderQueueStore(
        useShallow((s) => {
            const j = s.jobs[videoId];
            if (!j) return null;
            return {
                videoId: j.videoId,
                status: j.status,
                progress: j.progress,
                stage: j.stage,
                error: j.error,
                downloadUrl: j.downloadUrl,
                fileName: j.fileName,
                expiresAt: j.expiresAt,
                startedAt: j.startedAt,
                renderDurationSecs: j.renderDurationSecs,
            };
        }),
    );
    const cancelJob = useRenderQueueStore((s) => s.cancelJob);
    const deleteJob = useRenderQueueStore((s) => s.deleteJob);

    // Tick state — forces re-render every 60s so expiry countdown stays fresh
    const [now, setNow] = useState(() => Date.now());
    const [showDetail, setShowDetail] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Elapsed timer (shared hook) — safe to call unconditionally
    const elapsed = useElapsedTimer(
        job?.startedAt,
        job?.status ?? 'queued',
        job?.renderDurationSecs,
    );

    useEffect(() => {
        if (!job?.expiresAt || job?.status !== 'complete') return;
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [job?.expiresAt, job?.status]);

    if (!job) return null;

    const { status, progress, stage, error, downloadUrl, fileName, expiresAt, startedAt, renderDurationSecs } = job;

    // Expiry countdown for completed renders
    const expiryLabel = (() => {
        if (!expiresAt || status !== 'complete') return null;
        const remaining = expiresAt - now;
        if (remaining <= 0) return 'Expired';
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        if (hours > 0) return `${hours}h left`;
        const mins = Math.floor(remaining / (1000 * 60));
        return `${mins}m left`;
    })();

    const statusDisplay = getRenderStatusDisplay(status, 12, stage, progress, error);

    return (
        <div className="rounded-xl border border-border bg-card-bg p-3 animate-fade-in select-none">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-primary inline-flex items-center gap-1.5">
                    {statusDisplay.icon}
                    {(status === 'rendering' || status === 'queued') ? (
                        <span className="text-shimmer">{statusDisplay.label}</span>
                    ) : statusDisplay.label}
                    {(startedAt || renderDurationSecs != null) && (
                        <span className="text-[10px] text-text-tertiary font-normal tabular-nums">
                            {formatElapsed(elapsed)}
                        </span>
                    )}
                </span>
                <div className="flex items-center gap-2">
                    {status === 'rendering' && stage === 'encoding' && (
                        <span className="text-xs text-text-tertiary">
                            {`${Math.round(progress)}%`}
                        </span>
                    )}
                    {(status === 'rendering' || status === 'queued') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelJob(videoId)}
                            className="!h-auto !px-1.5 !py-0.5 text-xs"
                        >
                            Cancel
                        </Button>
                    )}
                    {status === 'complete' && downloadUrl && (
                        <div className="inline-flex items-center gap-2">
                            <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={fileName || 'render.mp4'}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium text-[#3ea6ff] hover:bg-[#3ea6ff]/10 transition-colors"
                            >
                                <Download size={12} />
                                Download
                            </a>
                            {expiryLabel && (
                                <span className="text-[10px] text-text-tertiary">{expiryLabel}</span>
                            )}
                        </div>
                    )}
                    {status !== 'rendering' && status !== 'queued' && (
                        <button
                            onClick={() => {
                                if (!confirmDelete) {
                                    setConfirmDelete(true);
                                    setTimeout(() => setConfirmDelete(false), 3000);
                                    return;
                                }
                                deleteJob(videoId);
                                setConfirmDelete(false);
                            }}
                            className={`p-1 rounded flex items-center justify-center transition-all border-none cursor-pointer
                                ${confirmDelete
                                    ? 'bg-red-600 scale-110 shadow-lg shadow-red-500/20 text-white'
                                    : 'text-text-tertiary hover:bg-red-500/10 hover:text-red-400'}`}
                            title={confirmDelete ? 'Click again to confirm delete' : 'Delete render'}
                        >
                            {confirmDelete ? <AlertCircle size={14} /> : <Trash2 size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            <RenderStatusBar status={status} progress={progress} shimmer />

            {/* Error message (two-tier) */}
            {error && (() => {
                const [userMsg, detail] = getUserFriendlyError(error);
                return (
                    <div className="mt-1.5">
                        <p className="text-xs text-red-400">{userMsg}</p>
                        {detail && (
                            <button
                                onClick={() => setShowDetail((v) => !v)}
                                className="text-[10px] text-text-tertiary hover:text-text-secondary inline-flex items-center gap-0.5 mt-0.5 transition-colors"
                            >
                                {showDetail ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                {showDetail ? 'Hide details' : 'Show details'}
                            </button>
                        )}
                        {showDetail && detail && (
                            <p className="text-[10px] text-text-tertiary mt-0.5 font-mono break-all">{detail}</p>
                        )}
                    </div>
                );
            })()}
        </div>
    );
};
