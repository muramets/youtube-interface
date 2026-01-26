import { useMemo } from 'react';
import type { TrendVideo, TimelineStats, MonthLayout } from '../../../../core/types/trends';
import { getTrendYPosition, getTrendXPosition } from '../utils/trendLayoutUtils';

export interface UseTrendBaselineProps {
    videos: TrendVideo[];
    stats: TimelineStats;
    monthLayouts: MonthLayout[]; // New dependency for X
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
            // Respect user's choice (e.g. 7, 16, 25, 90) but clamp to safe bounds
            const intent = baselineWindowSize || 30;
            let effectiveWindow = intent;

            // 1. Calculate Safe Bounds
            const MAX_CAP = 365; // Allow up to a year if data permits
            const clampedSafeMax = Math.min(MAX_CAP, Math.max(1, safeMax));

            // 2. Clamp intent
            effectiveWindow = Math.min(intent, clampedSafeMax);

            const windowMs = Math.max(1, effectiveWindow) * 24 * 60 * 60 * 1000;

            // Sampling: Aim for ~300 points for smoother granularity
            // Ensure step is at least 1 hour to avoid infinite loops on small ranges
            const stepMs = Math.max(1000 * 60 * 60, (maxDate - minDate) / 300);

            // Extend range slightly to cover edges
            const startT = minDate - stepMs;
            const endT = maxDate + stepMs;

            // GAUSSIAN WEIGHTED MOVING AVERAGE (Gaussian Kernel)
            // sigma determines the "smoothness". 
            // We use a minimum sigma of 5 days to ensure we always bridge gaps between videos,
            // even if the user selects a very small window.
            const MIN_SIGMA_MS = 5 * 24 * 60 * 60 * 1000;
            const sigma = Math.max(MIN_SIGMA_MS, (windowMs / 1.5));
            const sigmaSq2 = 2 * sigma * sigma;

            for (let t = startT; t <= endT; t += stepMs) {
                // Wide search: +/- 4 sigma to ensure zero-plateaus even at tails
                const searchBounds = 4 * sigma;
                const relevant = sortedVideos.filter(v =>
                    v.publishedAtTimestamp >= t - searchBounds &&
                    v.publishedAtTimestamp <= t + searchBounds
                );

                if (relevant.length > 0) {
                    let totalWeight = 0;
                    let weightedViews = 0;

                    for (const v of relevant) {
                        const diff = v.publishedAtTimestamp - t;
                        // Gaussian weight: e^(-x^2 / (2 * sigma^2))
                        const weight = Math.exp(-(diff * diff) / sigmaSq2);

                        weightedViews += v.viewCount * weight;
                        totalWeight += weight;
                    }

                    if (totalWeight > 0.0001) {
                        const weightedAvg = weightedViews / totalWeight;

                        const xNorm = getTrendXPosition(t, stats, monthLayouts);
                        const { y } = getTrendYPosition(
                            weightedAvg,
                            stats,
                            scalingMode,
                            verticalSpread,
                            dynamicWorldHeight
                        );

                        points.push({
                            x: xNorm,
                            y,
                            value: weightedAvg
                        });
                    }
                }
            }

            return { type: 'dynamic', points };
        }
    }, [videos, stats, monthLayouts, scalingMode, verticalSpread, dynamicWorldHeight, baselineMode, baselineWindowSize]);
};
