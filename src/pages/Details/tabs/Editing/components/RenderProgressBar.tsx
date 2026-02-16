import React from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';
import { useRenderQueueStore } from '../../../../../core/stores/renderQueueStore';
import { RenderStatusBar } from '../../../../../components/ui/atoms/RenderStatusBar';
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
                error: j.error,
                blobUrl: j.blobUrl,
                fileName: j.fileName,
            };
        }),
    );
    const cancelJob = useRenderQueueStore((s) => s.cancelJob);
    const clearJob = useRenderQueueStore((s) => s.clearJob);

    if (!job) return null;

    const { status, progress, error, blobUrl, fileName } = job;

    return (
        <div className="rounded-xl border border-border bg-card-bg p-3 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-primary">
                    {status === 'queued' && '⏳ Queued...'}
                    {status === 'rendering' && 'Rendering...'}
                    {status === 'complete' && '✓ Render complete'}
                    {status === 'error' && '✗ Render failed'}
                    {status === 'cancelled' && '⊘ Render cancelled'}
                </span>
                <div className="flex items-center gap-2">
                    {(status === 'rendering' || status === 'queued') && (
                        <span className="text-xs text-text-tertiary">
                            {status === 'queued' ? 'waiting' : `${Math.round(progress)}%`}
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
                    {status === 'complete' && blobUrl && (
                        <a
                            href={blobUrl}
                            download={fileName || 'render.mp4'}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium text-[#3ea6ff] hover:bg-[#3ea6ff]/10 transition-colors"
                        >
                            <Download size={12} />
                            Download
                        </a>
                    )}
                    {status !== 'rendering' && status !== 'queued' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => clearJob(videoId)}
                            className="!h-auto !p-1"
                        >
                            <X size={14} />
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            <RenderStatusBar status={status} progress={progress} shimmer />

            {/* Error message */}
            {error && (
                <p className="text-xs text-red-400 mt-1.5">{error}</p>
            )}
        </div>
    );
};
