import React, { useCallback, useRef, useState } from 'react';
import { useEditingStore } from '../../../../core/stores/editingStore';
import { useRenderQueueStore } from '../../../../core/stores/renderQueueStore';
import { ImagePreview } from './components/ImagePreview';
import { AudioTimeline } from './components/AudioTimeline';
import { RenderControls } from './components/RenderControls';
import { TrackBrowser } from './components/TrackBrowser';
import { RenderProgressBar } from './components/RenderProgressBar';
import { useEditingPersistence } from './hooks/useEditingPersistence';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';

interface EditingTabProps {
    video: VideoDetails;
}

const MIN_BROWSER_WIDTH = 240;
const MAX_BROWSER_WIDTH = 480;
const DEFAULT_BROWSER_WIDTH = 320;

export const EditingTab: React.FC<EditingTabProps> = ({ video }) => {
    const isBrowserOpen = useEditingStore((s) => s.isBrowserOpen);
    const toggleBrowser = useEditingStore((s) => s.toggleBrowser);
    const hasRenderJob = useRenderQueueStore((s) => !!s.jobs[video.id]);
    const [browserWidth, setBrowserWidth] = useState(DEFAULT_BROWSER_WIDTH);
    const isResizing = useRef(false);

    // Auto-save & auto-load editing session per video
    useEditingPersistence(video.id);


    // ── Resizable browser panel ────────────────────────────────────────
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        const startX = e.clientX;
        const startWidth = browserWidth;

        const onMouseMove = (ev: MouseEvent) => {
            if (!isResizing.current) return;
            const delta = startX - ev.clientX; // dragging left = wider
            const newWidth = Math.min(MAX_BROWSER_WIDTH, Math.max(MIN_BROWSER_WIDTH, startWidth + delta));
            setBrowserWidth(newWidth);
        };

        const onMouseUp = () => {
            isResizing.current = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, [browserWidth]);

    // ── Default image from video thumbnail ─────────────────────────────
    const defaultImageUrl = video.thumbnail || '';

    return (
        <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* ── Left Column: Editor ──────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 gap-5 relative" style={{ scrollbarGutter: 'stable' }}>
                {/* Image Preview */}
                <ImagePreview
                    defaultImageUrl={defaultImageUrl}
                    videoId={video.id}
                    isBrowserOpen={isBrowserOpen}
                    onToggleBrowser={toggleBrowser}
                />

                {/* Audio Timeline */}
                <AudioTimeline />

                {/* Render Controls */}
                <RenderControls
                    videoId={video.id}
                    videoTitle={(video.abTestTitles?.length ? video.abTestTitles[0] : video.title) || 'Untitled'}
                    defaultImageUrl={defaultImageUrl}
                />

                {/* Render Progress (shown when a job exists) */}
                {hasRenderJob && <RenderProgressBar videoId={video.id} />}
            </div>

            {/* ── Resize Handle ─────────────────────────────────────────── */}
            {isBrowserOpen && (
                <div
                    className="w-1 cursor-ew-resize hover:bg-accent/30 active:bg-accent/50 transition-colors flex-shrink-0"
                    onMouseDown={handleResizeStart}
                />
            )}

            {/* ── Right Column: Track Browser ──────────────────────────── */}
            {isBrowserOpen && (
                <div
                    className="flex-shrink-0 border-l border-border bg-bg-secondary overflow-hidden"
                    style={{ width: browserWidth }}
                >
                    <TrackBrowser />
                </div>
            )}
        </div>
    );
};
