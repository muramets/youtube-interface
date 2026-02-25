// =============================================================================
// CHAT: SaveTargetPopover — compact dropdown for choosing save destination.
// Two sections: "Save to Video" (from conversation context) + "Save to Canvas".
// Smart positioning: auto-flips above anchor when not enough space below.
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

const POPOVER_WIDTH = 260;
const POPOVER_MAX_HEIGHT = 340;
const VIEWPORT_PADDING = 12;

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

    // --- Smart positioning: measure after mount, flip if needed ---
    const [style, setStyle] = useState<React.CSSProperties>({
        top: anchorRect.top,
        left: anchorRect.left,
        transform: 'translateX(-50%)',
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        opacity: 0, // Hidden until positioned
    });

    useEffect(() => {
        // Wait one frame for the popover to mount and measure its height
        requestAnimationFrame(() => {
            const el = popoverRef.current;
            if (!el) return;

            const popoverH = el.scrollHeight;
            const viewportH = window.innerHeight;
            const viewportW = window.innerWidth;

            const spaceBelow = viewportH - anchorRect.top - VIEWPORT_PADDING;
            const spaceAbove = anchorRect.top - VIEWPORT_PADDING;

            let top: number;
            let maxH: number;

            if (spaceBelow >= popoverH || spaceBelow >= spaceAbove) {
                // Enough space below, or below is better than above → render below
                top = anchorRect.top;
                maxH = Math.min(POPOVER_MAX_HEIGHT, spaceBelow);
            } else {
                // Not enough space below, more space above → flip upward
                maxH = Math.min(POPOVER_MAX_HEIGHT, spaceAbove);
                top = anchorRect.top - Math.min(popoverH, maxH);
            }

            // Horizontal clamp: keep popover within viewport
            const halfW = POPOVER_WIDTH / 2;
            let left = anchorRect.left;
            if (left - halfW < VIEWPORT_PADDING) {
                left = halfW + VIEWPORT_PADDING;
            } else if (left + halfW > viewportW - VIEWPORT_PADDING) {
                left = viewportW - halfW - VIEWPORT_PADDING;
            }

            setStyle({
                top,
                left,
                transform: 'translateX(-50%)',
                width: POPOVER_WIDTH,
                maxHeight: maxH,
                opacity: 1,
            });
        });
    }, [anchorRect.top, anchorRect.left]);

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
            style={style}
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
