import { useMemo } from 'react';
import type { TrendVideo, TimelineStats } from '../../../../core/types/trends';
import { getTrendYPosition, getTrendXPosition } from '../utils/trendLayoutUtils';

export interface UseTrendBaselineProps {
    videos: TrendVideo[];
    stats: TimelineStats;
    monthLayouts: any[]; // New dependency for X
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    verticalSpread: number;
    dynamicWorldHeight: number;
    baselineMode?: 'global' | 'dynamic';
    baselineWindowSize?: number;
}

export interface BaselineDataPoint {
    x: number; // Normalized x (0-1)
    y: number; // Pixel Y relative to world height
    value: number; // Actual value
}

export interface BaselineData {
    type: 'global' | 'dynamic';
    y?: number; // For global
    value?: number; // For global
    points?: BaselineDataPoint[]; // For dynamic
}

export const useTrendBaseline = ({
    videos,
    stats,
    monthLayouts,
    scalingMode,
    verticalSpread,
    dynamicWorldHeight,
    baselineMode = 'dynamic',
    baselineWindowSize = 30
}: UseTrendBaselineProps): BaselineData | null => {
    return useMemo(() => {
        if (!videos.length || !stats) return null;
        if (scalingMode === 'percentile') return null;

        const { minDate, maxDate } = stats;

        if (baselineMode === 'global') {
            const total = videos.reduce((acc, v) => acc + v.viewCount, 0);
            const avg = total / videos.length;

            // Use shared utility for Y position
            const { y } = getTrendYPosition(
                avg,
                stats,
                scalingMode,
                verticalSpread,
                dynamicWorldHeight
            );

            return { type: 'global', y, value: avg };
        } else {
            // Dynamic: Rolling Window
            const points: BaselineDataPoint[] = [];

            // Sort videos once
            const sortedVideos = [...videos].sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);

            // Rolling Window Logic: Smart Collapse
            const durationDays = (maxDate - minDate) / (24 * 60 * 60 * 1000);
            const safeMax = durationDays / 3; // Theoretical max (can be huge)

            // Determine effective window based on INTENT (baselineWindowSize)
            // intent is 7 (Fast), 30 (Mid), or 90 (Slow)
            const intent = baselineWindowSize || 30;
            let effectiveWindow = 30;

            // 1. Calculate Safe Bounds
            const MAX_CAP = 90;
            const clampedSafeMax = Math.min(MAX_CAP, Math.max(1, safeMax));
            const safeFast = Math.min(7, clampedSafeMax);

            if (intent === 90) {
                effectiveWindow = clampedSafeMax;
            } else if (intent === 7) {
                effectiveWindow = safeFast;
            } else {
                // Midpoint Logic (intent 30)
                if (clampedSafeMax >= 90) {
                    effectiveWindow = 30; // Standard
                } else {
                    effectiveWindow = (safeFast + clampedSafeMax) / 2;
                }
            }

            const windowMs = Math.max(1, effectiveWindow) * 24 * 60 * 60 * 1000;

            // Sampling: Aim for ~200 points for smooth interaction
            // Ensure step is at least 1 hour to avoid infinite loops on small ranges
            const stepMs = Math.max(1000 * 60 * 60, (maxDate - minDate) / 200);

            // Extend range slightly to cover edges
            const startT = minDate - stepMs;
            const endT = maxDate + stepMs;

            for (let t = startT; t <= endT; t += stepMs) {
                // Relevant videos for this window
                // OPTIMIZATION: Sliding Window could be used here for O(N), but O(Steps * N) filtered is acceptable for N < 2000
                const relevant = sortedVideos.filter(v =>
                    v.publishedAtTimestamp >= t - windowMs &&
                    v.publishedAtTimestamp <= t + windowMs
                );

                if (relevant.length > 0) {
                    const avg = relevant.reduce((acc, v) => acc + v.viewCount, 0) / relevant.length;

                    // Use shared utility for X position (Handles Time Distribution)
                    const xNorm = getTrendXPosition(t, stats, monthLayouts);

                    // Use shared utility for Y position
                    const { y } = getTrendYPosition(
                        avg,
                        stats,
                        scalingMode,
                        verticalSpread,
                        dynamicWorldHeight
                    );

                    points.push({
                        x: xNorm, // 0-1
                        y, // World Y Pixels
                        value: avg
                    });
                }
            }

            return { type: 'dynamic', points };
        }
    }, [videos, stats, monthLayouts, scalingMode, verticalSpread, dynamicWorldHeight, baselineMode, baselineWindowSize]);
};
