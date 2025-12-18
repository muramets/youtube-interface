import React, { memo } from 'react';
import type { TrendVideo, VideoPosition } from '../../../../types/trends';

// Helper for formatting
const formatCompactNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

interface VideoNodeProps {
    position: VideoPosition;
    worldWidth: number;
    worldHeight: number;
    isFocused: boolean;
    isElevated: boolean;
    isActive: boolean;
    showLabel: boolean;
    onMouseEnter: (e: React.MouseEvent, vid: TrendVideo) => void;
    onMouseLeave: () => void;
    onDoubleClick: (video: TrendVideo, worldX: number, worldY: number) => void;
    onClick: (e: React.MouseEvent) => void;
}

export const VideoNode = memo(({
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
}: VideoNodeProps) => {
    const { video, xNorm, yNorm, baseSize } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * worldHeight;
    // Standard 16:9 Aspect Ratio
    const width = baseSize;
    const height = baseSize / (16 / 9);

    // Unified highlight state: active OR focused
    const isHighlighted = isFocused || isActive;

    const borderRadius = Math.max(2, Math.min(12, baseSize * 0.04)); // 4% of size, clamped 2-12px
    const labelSize = width * 0.13; // Proportional 13% of width
    const viewLabel = formatCompactNumber(video.viewCount);

    return (
        <div
            className={`absolute cursor-pointer group flex flex-col items-center will-change-transform ${isHighlighted ? 'drop-shadow-[0_8px_30px_rgba(255,255,255,0.15)]' : ''}`}
            style={{
                left: x,
                top: y,
                width: width,
                transform: `translate(-50%, -50%) ${isHighlighted ? 'scale(1.25)' : ''}`,
                // Elevated z-index when highlighted or was recently hovered
                zIndex: isHighlighted || isElevated ? 1000 : 10,
                filter: isHighlighted ? 'brightness(1.1)' : 'brightness(1)',
                transition: 'transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out',
            }}
            onMouseEnter={(e) => onMouseEnter(e, video)}
            onClick={onClick}
            onMouseLeave={onMouseLeave}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(video, x, y);
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
                    // Premium ring only for active state (on top of hover glow)
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

VideoNode.displayName = 'VideoNode';
