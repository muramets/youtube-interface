// =============================================================================
// CanvasSelectionChip — Renders canvas selection as chips in ChatInput
// =============================================================================
//
// Splits CanvasSelectionContext.nodes by type and renders:
//   - Video / traffic-source nodes → reuses existing VideoCardChip
//   - Sticky notes → compact chip with color dot + content preview
//   - Images → compact chip with thumbnail preview
// =============================================================================

import React from 'react';
import { X, StickyNote, Image as ImageIcon } from 'lucide-react';
import type { CanvasSelectionContext, VideoContextNode, TrafficSourceContextNode, StickyNoteContextNode, ImageContextNode, VideoCardContext } from '../../core/types/appContext';
import { VideoCardChip } from './VideoCardChip';

interface CanvasSelectionChipProps {
    context: CanvasSelectionContext;
    onRemove?: () => void;
    compact?: boolean;
    /** Cumulative offset for video numbering across multiple canvas selections */
    videoStartIndex?: number;
}

/** Map a canvas video/traffic-source node to VideoCardContext for chip rendering. */
function toVideoCardContext(node: VideoContextNode | TrafficSourceContextNode): VideoCardContext {
    return {
        type: 'video-card',
        videoId: node.videoId || '',
        title: node.title || 'Untitled',
        description: node.nodeType === 'video' ? node.description : '',
        tags: node.nodeType === 'video' ? node.tags : [],
        thumbnailUrl: node.thumbnailUrl || '',
        channelTitle: node.channelTitle,
        viewCount: node.nodeType === 'video' ? node.viewCount : undefined,
        publishedAt: node.nodeType === 'video' ? node.publishedAt : undefined,
        duration: node.nodeType === 'video' ? node.duration : undefined,
        ownership: node.nodeType === 'video' ? node.ownership : 'competitor',
    };
}

/** Truncate text to maxLen characters. */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trimEnd() + '…';
}

/** Strip common markdown syntax for plain-text preview. */
function stripMarkdown(md: string): string {
    return md
        .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
        .replace(/\*(.+?)\*/g, '$1')        // *italic*
        .replace(/^#{1,6}\s+/gm, '')        // # headings
        .replace(/^[-*]\s+/gm, '')          // - list items
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
        .replace(/\n+/g, ' ')               // newlines → spaces
        .trim();
}

const NOTE_DOT_COLORS: Record<string, string> = {
    yellow: '#F59E0B',
    pink: '#EC4899',
    red: '#EF4444',
    blue: '#3B82F6',
    green: '#10B981',
    neutral: '#9CA3AF',
};

export const CanvasSelectionChip: React.FC<CanvasSelectionChipProps> = React.memo(({ context, onRemove, compact, videoStartIndex }) => {
    const videos = context.nodes.filter((n): n is VideoContextNode | TrafficSourceContextNode => n.nodeType === 'video' || n.nodeType === 'traffic-source');
    const notes = context.nodes.filter((n): n is StickyNoteContextNode => n.nodeType === 'sticky-note');
    const images = context.nodes.filter((n): n is ImageContextNode => n.nodeType === 'image');

    return (
        <div className="flex flex-col gap-1.5">
            {/* Video / traffic-source chips — reuse VideoCardChip */}
            {videos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {videos.map((v, i) => (
                        <VideoCardChip
                            key={v.videoId || v.title}
                            video={toVideoCardContext(v)}
                            index={videoStartIndex != null ? videoStartIndex + i + 1 : undefined}
                        />
                    ))}
                </div>
            )}

            {/* Sticky note chips */}
            {notes.map((note, i) => (
                <div
                    key={`note-${i}`}
                    className="canvas-note-chip flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-secondary max-w-[280px] transition-colors duration-150"
                    style={{ '--note-tint': NOTE_DOT_COLORS[note.noteColor || 'yellow'] || NOTE_DOT_COLORS.yellow } as React.CSSProperties}
                >
                    <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: NOTE_DOT_COLORS[note.noteColor || 'yellow'] || NOTE_DOT_COLORS.yellow }}
                    />
                    <StickyNote size={12} className="text-text-tertiary shrink-0" />
                    <span className="truncate">{truncate(stripMarkdown(note.content || ''), 60)}</span>
                </div>
            ))}

            {/* Image chips */}
            {images.map((img, i) => (
                <div
                    key={`img-${i}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.05] text-xs text-text-secondary max-w-[280px]"
                >
                    {img.imageUrl ? (
                        <img
                            src={img.imageUrl}
                            alt=""
                            className="w-[40px] h-[30px] object-cover rounded shrink-0"
                            loading="lazy"
                        />
                    ) : (
                        <ImageIcon size={12} className="text-text-tertiary shrink-0" />
                    )}
                    <span className="truncate">{img.alt || 'Image'}</span>
                </div>
            ))}

            {/* Overall remove button — hidden in compact (history) mode */}
            {!compact && onRemove && (
                <button
                    className="self-start flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-red-400 transition-colors"
                    onClick={onRemove}
                    title="Clear canvas context"
                >
                    <X size={10} />
                    <span>Clear canvas context</span>
                </button>
            )}
        </div>
    );
});
CanvasSelectionChip.displayName = 'CanvasSelectionChip';
