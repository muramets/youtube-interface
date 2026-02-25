// =============================================================================
// CHAT: SaveTargetPopover — compact dropdown for choosing save destination.
// Two sections: "Save to Video" (from conversation context) + "Save to Canvas".
// Pure UI — receives callbacks for save actions.
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Video, LayoutDashboard, Check } from 'lucide-react';

/** Lightweight save target — only the fields needed by the save flow. */
export interface SaveTarget {
    videoId: string;
    title: string;
    thumbnailUrl: string;
}

interface CanvasPage {
    id: string;
    title: string;
}

interface SaveTargetPopoverProps {
    anchorRect: { top: number; left: number };
    /** Videos from the conversation context */
    contextVideos: SaveTarget[];
    /** Available canvas pages */
    canvasPages: CanvasPage[];
    /** Called when user picks a video */
    onSaveToVideo: (video: SaveTarget) => void;
    /** Called when user picks a canvas page */
    onSaveToCanvas: (pageId: string) => void;
    /** Dismiss */
    onClose: () => void;
}

export const SaveTargetPopover: React.FC<SaveTargetPopoverProps> = ({
    anchorRect,
    contextVideos,
    canvasPages,
    onSaveToVideo,
    onSaveToCanvas,
    onClose,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [savedId, setSavedId] = useState<string | null>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler, true);
        return () => document.removeEventListener('mousedown', handler, true);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleVideoClick = useCallback((video: SaveTarget) => {
        setSavedId(video.videoId);
        onSaveToVideo(video);
    }, [onSaveToVideo]);

    const handleCanvasClick = useCallback((pageId: string) => {
        setSavedId(pageId);
        onSaveToCanvas(pageId);
    }, [onSaveToCanvas]);

    const hasVideos = contextVideos.length > 0;
    const hasPages = canvasPages.length > 0;

    return createPortal(
        <div
            ref={popoverRef}
            className="animate-fade-in fixed bg-card-bg backdrop-blur-md border border-border rounded-xl shadow-2xl z-toast overflow-hidden flex flex-col"
            style={{
                top: anchorRect.top,
                left: anchorRect.left,
                transform: 'translateX(-50%)',
                width: 260,
                maxHeight: 340,
            }}
        >
            {/* --- Save to Video --- */}
            {hasVideos && (
                <div className="py-2">
                    <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
                        <Video size={11} />
                        Save to Video
                    </div>
                    <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        {contextVideos.map((v) => (
                            <button
                                key={v.videoId}
                                onClick={() => handleVideoClick(v)}
                                disabled={savedId === v.videoId}
                                className={`flex items-center gap-2 w-full px-3 py-1.5 bg-transparent border-none text-left text-text-primary text-xs font-medium transition-colors ${savedId === v.videoId
                                    ? 'cursor-default opacity-60'
                                    : 'cursor-pointer hover:bg-white/5'
                                    }`}
                            >
                                {v.thumbnailUrl ? (
                                    <img
                                        src={v.thumbnailUrl}
                                        alt=""
                                        className="w-10 h-[23px] rounded object-cover flex-shrink-0"
                                    />
                                ) : (
                                    <div className="w-10 h-[23px] rounded bg-bg-secondary flex-shrink-0" />
                                )}
                                <span className="flex-1 min-w-0 leading-tight line-clamp-2">
                                    {v.title}
                                </span>
                                {savedId === v.videoId && (
                                    <Check size={14} className="text-green-500 flex-shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Divider */}
            {hasVideos && hasPages && (
                <div className="h-px bg-border mx-3" />
            )}

            {/* --- Save to Canvas --- */}
            {hasPages && (
                <div className="py-2">
                    <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
                        <LayoutDashboard size={11} />
                        Save to Canvas
                    </div>
                    <div className="max-h-[120px] overflow-y-auto custom-scrollbar">
                        {canvasPages.map((page) => (
                            <button
                                key={page.id}
                                onClick={() => handleCanvasClick(page.id)}
                                disabled={savedId === page.id}
                                className={`flex items-center gap-2 w-full px-3 py-1.5 bg-transparent border-none text-left text-text-primary text-xs font-medium transition-colors ${savedId === page.id
                                    ? 'cursor-default opacity-60'
                                    : 'cursor-pointer hover:bg-white/5'
                                    }`}
                            >
                                <span className="flex-1 min-w-0">{page.title}</span>
                                {savedId === page.id && (
                                    <Check size={14} className="text-green-500 flex-shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!hasVideos && !hasPages && (
                <div className="py-4 px-3 text-center text-xs text-text-secondary">
                    No save targets available
                </div>
            )}
        </div>,
        document.body
    );
};
