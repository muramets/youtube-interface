import React, { memo } from 'react';
import type { TrendVideo } from '../../../../types/trends';
import type { VideoPosition } from '../hooks/useTimelineData';

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
    showLabel: boolean;
    onMouseEnter: (e: React.MouseEvent, vid: TrendVideo) => void;
    onMouseLeave: () => void;
    onDoubleClick: (video: TrendVideo, worldX: number, worldY: number) => void;
}

export const VideoNode = memo(({
    position,
    worldWidth,
    worldHeight,
    isFocused,
    isElevated,
    showLabel,
    onMouseEnter,
    onMouseLeave,
    onDoubleClick
}: VideoNodeProps) => {
    const { video, xNorm, yNorm, baseSize } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * worldHeight;
    // Standard 16:9 Aspect Ratio
    const width = baseSize;
    const height = baseSize / (16 / 9);

    const borderRadius = Math.max(2, Math.min(12, baseSize * 0.04)); // 4% of size, clamped 2-12px
    const viewLabel = formatCompactNumber(video.viewCount);

    return (
        <div
            className={`absolute cursor-pointer group flex flex-col items-center will-change-transform ${isFocused ? 'drop-shadow-[0_8px_30px_rgba(255,255,255,0.15)]' : ''}`}
            style={{
                left: x,
                top: y,
                width: width,
                // Center the node
                transform: `translate(-50%, -50%) ${isFocused ? 'scale(1.25)' : ''}`,
                zIndex: isElevated ? 1000 : 10,
                filter: isFocused ? 'brightness(1.1)' : 'brightness(1)',
                transition: 'transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={(e) => onMouseEnter(e, video)}
            onMouseLeave={onMouseLeave}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(video, x, y);
            }}
        >
            <div
                className={`overflow-hidden shadow-lg bg-black/50 w-full ${isFocused ? 'shadow-2xl shadow-white/20' : 'group-hover:shadow-xl'}`}
                style={{
                    height,
                    borderRadius: `${borderRadius}px`,
                    backgroundImage: `url(${video.thumbnail})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transition: 'box-shadow 200ms ease-out',
                }}
            />
            {showLabel && (
                <span className={`mt-1.5 text-[10px] font-medium transition-colors bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm pointer-events-none whitespace-nowrap ${isFocused ? 'text-white' : 'text-white/50 group-hover:text-white'}`}>
                    {viewLabel}
                </span>
            )}
        </div>
    );
});

VideoNode.displayName = 'VideoNode';
