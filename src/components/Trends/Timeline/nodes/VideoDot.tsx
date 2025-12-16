import React, { memo } from 'react';
import type { TrendVideo } from '../../../../types/trends';
import type { VideoPosition } from '../hooks/useTimelineData';

interface VideoDotProps {
    position: VideoPosition;
    worldWidth: number;
    worldHeight: number;
    percentileGroup: string | undefined;
    isFocused: boolean;
    isElevated: boolean;
    onMouseEnter: (e: React.MouseEvent, vid: TrendVideo) => void;
    onMouseLeave: () => void;
    onDoubleClick: (video: TrendVideo, worldX: number, worldY: number) => void;
}

// Helper for percentile styles
const getPercentileStyle = (percentile: string | undefined) => {
    switch (percentile) {
        case 'Top 1%':
            return { color: 'bg-emerald-500', size: 24 };
        case 'Top 5%':
            return { color: 'bg-lime-500', size: 20 };
        case 'Top 20%':
            return { color: 'bg-blue-500', size: 16 };
        case 'Middle 60%':
            return { color: 'bg-purple-400', size: 12 };
        case 'Bottom 20%':
            return { color: 'bg-red-400', size: 10 };
        default:
            return { color: 'bg-gray-400', size: 10 };
    }
};

export const VideoDot = memo(({
    position,
    worldWidth,
    worldHeight,
    percentileGroup,
    isFocused,
    isElevated,
    onMouseEnter,
    onMouseLeave,
    onDoubleClick
}: VideoDotProps) => {
    const { video, xNorm, yNorm } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * worldHeight;
    const { color, size: baseSize } = getPercentileStyle(percentileGroup);

    return (
        <div
            className="absolute"
            style={{
                left: x,
                top: y,
                width: baseSize,
                height: baseSize,
                // Static Counter-Scaling (Instant, NO Transition)
                transform: `translate(-50%, -50%) scale(calc(1 / var(--timeline-scale, 1)))`,
                zIndex: isElevated ? 1000 : 10,
                willChange: 'transform'
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
                className={`w-full h-full rounded-full cursor-pointer ${color} ${isFocused ? 'shadow-lg shadow-white/30' : 'shadow-sm'}`}
                style={{
                    // Interaction Scaling (Animated)
                    transform: isFocused ? 'scale(1.4)' : 'scale(1)',
                    filter: isFocused ? 'brightness(1.2)' : 'brightness(1)',
                    transition: 'transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out',
                }}
            />
        </div>
    );
});

VideoDot.displayName = 'VideoDot';
