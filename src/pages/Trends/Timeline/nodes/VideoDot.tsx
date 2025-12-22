import React, { memo } from 'react';
import type { TrendVideo, VideoPosition } from '../../../../core/types/trends';
import { MIN_INTERACTION_SIZE_PX } from '../utils/timelineConstants';

interface VideoDotProps {
    position: VideoPosition;
    worldWidth: number;
    worldHeight: number;
    percentileGroup: string | undefined;
    isFocused: boolean;
    isElevated: boolean;
    isActive: boolean;
    onMouseEnter: (e: React.MouseEvent, vid: TrendVideo) => void;
    onMouseLeave: () => void;
    onDoubleClick: (video: TrendVideo, worldX: number, worldY: number, e: React.MouseEvent) => void;
    onClick: (e: React.MouseEvent) => void;
}

// Helper for percentile styles
import { getDotStyle } from '../../../../core/utils/trendStyles';


export const VideoDot = memo(({
    position,
    worldWidth,
    worldHeight,
    percentileGroup,
    isFocused,
    isElevated,
    isActive,
    onMouseEnter,
    onMouseLeave,
    onDoubleClick,
    onClick
}: VideoDotProps) => {
    const { video, xNorm, yNorm } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * worldHeight;
    const { tailwindColor: color, size: baseSize } = getDotStyle(percentileGroup);

    // Unified highlight state: active OR focused
    const isHighlighted = isFocused || isActive;

    const effectiveSize = Math.max(baseSize, MIN_INTERACTION_SIZE_PX);

    return (
        <div
            className="absolute outline-none focus:outline-none focus:ring-0"
            style={{
                left: x,
                top: y,
                width: effectiveSize,
                height: effectiveSize,
                transform: `translate(-50%, -50%) scale(max(1, calc(0.20 / var(--timeline-scale, 0.20))))`,
                // Elevated z-index when highlighted or was recently hovered
                zIndex: isHighlighted || isElevated ? 1000 : 10,
                willChange: 'transform'
            }}
            onMouseEnter={(e) => onMouseEnter(e, video)}
            onClick={onClick}
            onMouseLeave={onMouseLeave}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(video, x, y, e);
            }}
        >
            <div
                className={`rounded-full cursor-pointer ${color} ${isHighlighted ? 'shadow-lg shadow-white/30' : 'shadow-sm'}`}
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) ${isHighlighted ? 'scale(1.4)' : 'scale(1)'}`,
                    width: baseSize,
                    height: baseSize,
                    filter: isHighlighted ? 'brightness(1.2)' : 'brightness(1)',
                    transition: 'transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out',
                    // Premium ring only for active state (on top of hover glow)
                    boxShadow: isActive
                        ? '0 0 0 3px rgba(255,255,255,0.9), 0 0 24px rgba(255,255,255,0.5)'
                        : isHighlighted
                            ? '0 4px 20px rgba(255,255,255,0.3)'
                            : undefined,
                }}
            />
        </div>
    );
});

VideoDot.displayName = 'VideoDot';
