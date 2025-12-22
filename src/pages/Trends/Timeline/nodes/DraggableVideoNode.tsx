import React, { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { TrendVideo, VideoPosition } from '../../../../core/types/trends';
import { useTrendStore } from '../../../../core/stores/trendStore';

// Helper for formatting
const formatCompactNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

interface DraggableVideoNodeProps {
    position: VideoPosition;
    worldWidth: number;
    worldHeight: number;
    isFocused: boolean;
    isElevated: boolean;
    isActive: boolean;
    showLabel: boolean;
    onMouseEnter: (e: React.MouseEvent, vid: TrendVideo) => void;
    onMouseLeave: () => void;
    onDoubleClick: (video: TrendVideo, worldX: number, worldY: number, e: React.MouseEvent) => void;
    onClick: (e: React.MouseEvent) => void;
}

/**
 * Premium Draggable Video Node for Timeline.
 * 
 * Features:
 * - Smooth drag initiation with @dnd-kit
 * - Visual feedback during drag (opacity, scale)
 * - Preserves all hover/active states
 * - Only renders in thumbnail mode (not dots)
 */
export const DraggableVideoNode = memo(({
    position,
    worldWidth,
    worldHeight,
    isFocused,
    isElevated,
    isActive,
    showLabel,
    onMouseEnter,
    onMouseLeave,
    onDoubleClick,
    onClick
}: DraggableVideoNodeProps) => {
    const { video, xNorm, yNorm, baseSize } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * worldHeight;

    // DnD setup - video data is passed for use in drag handlers
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `video-${video.id}`,
        data: {
            video,
            baseSize // Explicitly pass baseSize for ghost sizing
        }
    });

    // Standard 16:9 Aspect Ratio
    const width = baseSize;
    const height = baseSize / (16 / 9);

    // Unified highlight state: active OR focused
    const isHighlighted = isFocused || isActive;

    const borderRadius = Math.max(2, Math.min(12, baseSize * 0.04));
    const labelSize = width * 0.13;
    const viewLabel = formatCompactNumber(video.viewCount);

    // Transform style for drag - only apply translation
    const dragStyle = transform ? {
        transform: CSS.Translate.toString(transform),
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            className={`absolute cursor-grab group flex flex-col items-center will-change-transform outline-none focus:outline-none focus:ring-0 ${isHighlighted ? 'drop-shadow-[0_8px_30px_rgba(255,255,255,0.15)]' : ''}`}
            style={{
                left: x,
                top: y,
                width: width,
                // Combine base transform with drag transform
                transform: `translate(-50%, -50%) ${isHighlighted ? 'scale(1.25)' : ''}`,
                // During drag: hide original completely (ghost shown via DragOverlay)
                opacity: isDragging ? 0 : 1,
                zIndex: isDragging ? 2000 : (isHighlighted || isElevated ? 1000 : 10),
                filter: isHighlighted ? 'brightness(1.1)' : 'brightness(1)',
                transition: isDragging ? 'none' : 'transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out',
                // Apply drag translation
                ...dragStyle
            }}
            // DnD listeners for drag initiation
            // DnD listeners for drag initiation - Intercept to stop bubbling to timeline
            {...listeners}
            onPointerDown={(e) => {
                listeners?.onPointerDown?.(e);
                // Stop propagation to prevent timeline from starting pan/zoom logic
                e.stopPropagation();
            }}
            onMouseDown={(e) => {
                // Also stop mousedown propagation for legacy/compat handling in timeline
                e.stopPropagation();
            }}
            onMouseMove={(e) => {
                // Stop mousemove to prevent timeline from detecting "pan threshold" on videos
                e.stopPropagation();
            }}
            {...attributes}
            // Original event handlers
            onMouseEnter={(e) => !isDragging && onMouseEnter(e, video)}
            onClick={(e) => !isDragging && onClick(e)}
            onMouseLeave={() => !isDragging && onMouseLeave()}
            onDoubleClick={(e) => {
                if (isDragging) return;
                e.stopPropagation();
                onDoubleClick(video, x, y, e);
            }}
        >
            <div
                className={`overflow-hidden shadow-lg bg-black/50 w-full ${isHighlighted ? 'shadow-2xl shadow-white/20' : 'group-hover:shadow-xl'}`}
                style={{
                    height,
                    borderRadius: `${borderRadius}px`,
                    backgroundImage: `url(${video.thumbnail})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transition: 'box-shadow 200ms ease-out',
                    boxShadow: isActive
                        ? '0 0 0 3px rgba(255,255,255,0.95), 0 0 30px rgba(255,255,255,0.4)'
                        : undefined,
                }}
            />
            {showLabel && (
                <span
                    className={`font-medium transition-colors bg-black/40 rounded-sm backdrop-blur-sm pointer-events-none whitespace-nowrap ${isHighlighted ? 'text-white' : 'text-white/50 group-hover:text-white'}`}
                    style={{
                        fontSize: labelSize,
                        marginTop: labelSize * 0.4,
                        padding: '0.15em 0.5em',
                        borderRadius: labelSize * 0.4
                    }}
                >
                    {viewLabel}
                </span>
            )}
        </div>
    );
});

DraggableVideoNode.displayName = 'DraggableVideoNode';

/**
 * Ghost preview shown in DragOverlay during drag.
 * Smaller, elevated version of the video thumbnail.
 */
interface VideoNodeGhostProps {
    video: TrendVideo;
}

export const VideoNodeGhost: React.FC<VideoNodeGhostProps> = ({ video }) => {
    const { visualScale, draggedBaseSize } = useTrendStore();

    // Use the actual baseSize of the video if available, fallback to 120
    const baseWidth = draggedBaseSize || 120;
    const height = baseWidth / (16 / 9);
    const borderRadius = Math.max(2, Math.min(12, baseWidth * 0.04));

    return (
        <div
            className="flex flex-col items-center pointer-events-none animate-ghost-in"
            style={{
                width: baseWidth,
                // Center ghost under cursor AND apply current timeline scale
                // This ensures the ghost matches the size of the video on the timeline
                transform: `translate(-50%, -50%) scale(${visualScale})`,
                // Smooth interpolation for faster feel while remaining fluid
                transition: 'transform 50ms ease-out',
                // Premium glow effect during drag
                filter: 'drop-shadow(0 12px 40px rgba(255,255,255,0.3))',
            }}
        >
            <div
                className="overflow-hidden shadow-2xl w-full"
                style={{
                    height,
                    borderRadius: `${borderRadius}px`,
                    backgroundImage: `url(${video.thumbnail})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            />
            {/* Animation Keyframes */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes ghost-in {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(${visualScale * 0.8}); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(${visualScale}); }
                }
                .animate-ghost-in {
                    animation: ghost-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
                }
            `}} />
        </div>
    );
};
