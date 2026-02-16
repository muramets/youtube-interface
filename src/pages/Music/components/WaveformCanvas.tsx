// =============================================================================
// WAVEFORM CANVAS: Web Audio API + Canvas Visualization
// =============================================================================

import React, { useRef, useEffect, useCallback } from 'react';
import { extractPeaks, PEAK_COUNT } from '../../../core/utils/audioPeaks';

interface WaveformCanvasProps {
    /** Pre-computed peaks array (0-1 normalized) OR audio URL to compute from */
    peaks?: number[];
    audioUrl?: string;
    /** Current playback progress (0-1) */
    progress?: number;
    /** Height of the canvas */
    height?: number;
    /** Color for played portion */
    playedColor?: string;
    /** Color for unplayed portion */
    unplayedColor?: string;
    /** Called when user clicks to seek (0-1 position) */
    onSeek?: (position: number) => void;
    /** Called when peaks are computed from audio URL */
    onPeaksComputed?: (peaks: number[]) => void;
    /** Compact mode for small cards */
    compact?: boolean;
    /** Fraction (0–1) of waveform trimmed from start — rendered as dim grey */
    trimStartFraction?: number;
    /** Fraction (0–1) of waveform trimmed from end — rendered as dim grey */
    trimEndFraction?: number;
}

const COMPACT_PEAK_COUNT = 60;

// Pre-computed loading skeleton heights (module-level to avoid impure calls in render)
const LOADING_HEIGHTS = Array.from({ length: 20 }, () => 20 + Math.random() * 60);
const LOADING_HEIGHTS_COMPACT = Array.from({ length: 12 }, () => 20 + Math.random() * 60);

// =============================================================================
// usePeaks — Custom hook (useReducer-based) for peak fetching & prop sync.
// All state transitions go through a pure reducer, so effects only dispatch.
// =============================================================================

type PeakAction =
    | { type: 'SYNC_PROPS'; peaks: number[] }
    | { type: 'FETCH_START' }
    | { type: 'FETCH_SUCCESS'; peaks: number[] }
    | { type: 'FETCH_ERROR' };

interface PeakState {
    peaks: number[];
    isLoading: boolean;
}

function peakReducer(_state: PeakState, action: PeakAction): PeakState {
    switch (action.type) {
        case 'SYNC_PROPS':
            return { peaks: action.peaks, isLoading: false };
        case 'FETCH_START':
            return { peaks: [], isLoading: true };
        case 'FETCH_SUCCESS':
            return { peaks: action.peaks, isLoading: false };
        case 'FETCH_ERROR':
            return { peaks: [], isLoading: false };
    }
}

function usePeaks(
    initialPeaks: number[] | undefined,
    audioUrl: string | undefined,
    peakCount: number,
    onPeaksComputed?: (peaks: number[]) => void,
): PeakState {
    const [state, dispatch] = React.useReducer(peakReducer, undefined, () => ({
        peaks: initialPeaks || [],
        isLoading: !initialPeaks && !!audioUrl,
    }));

    // Stable ref for callback — avoids refetching when parent re-renders
    const onPeaksComputedRef = useRef(onPeaksComputed);
    useEffect(() => {
        onPeaksComputedRef.current = onPeaksComputed;
    });

    // Sync prop → state when initialPeaks changes
    useEffect(() => {
        if (initialPeaks) {
            dispatch({ type: 'SYNC_PROPS', peaks: initialPeaks });
        }
    }, [initialPeaks]);

    // Fetch peaks from audioUrl when no initial peaks are provided
    useEffect(() => {
        if (initialPeaks || !audioUrl) return;

        let cancelled = false;
        dispatch({ type: 'FETCH_START' });

        extractPeaks(audioUrl, peakCount)
            .then((computed) => {
                if (cancelled) return;
                dispatch({ type: 'FETCH_SUCCESS', peaks: computed });
                onPeaksComputedRef.current?.(computed);
            })
            .catch((err) => {
                console.error('[Waveform] Failed to extract peaks:', err);
                if (!cancelled) dispatch({ type: 'FETCH_ERROR' });
            });

        return () => { cancelled = true; };
    }, [audioUrl, initialPeaks, peakCount]);

    return state;
}

// =============================================================================
// Drawing
// =============================================================================

function drawWaveform(
    ctx: CanvasRenderingContext2D,
    peaks: number[],
    width: number,
    height: number,
    progress: number,
    playedColor: string,
    unplayedColor: string,
    trimStartFraction = 0,
    trimEndFraction = 0,
) {
    ctx.clearRect(0, 0, width, height);

    const barCount = peaks.length;
    const barWidth = Math.max(1, (width / barCount) * 0.6);
    const gap = (width - barWidth * barCount) / barCount;
    const centerY = height / 2;
    const maxBarHeight = height * 0.85;
    const minBarHeight = 2;

    const progressX = progress * width;
    const trimmedColor = 'rgba(255, 255, 255, 0.06)';

    for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap) + gap / 2;
        const barHeight = Math.max(minBarHeight, peaks[i] * maxBarHeight);
        const y = centerY - barHeight / 2;

        const barFraction = (i + 0.5) / barCount;
        const isTrimmed = barFraction < trimStartFraction || barFraction > (1 - trimEndFraction);

        if (isTrimmed) {
            ctx.fillStyle = trimmedColor;
        } else {
            const isPlayed = x + barWidth / 2 <= progressX;
            ctx.fillStyle = isPlayed ? playedColor : unplayedColor;
        }

        // Rounded bar caps
        const radius = Math.min(barWidth / 2, 1.5);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
    }

    // Draw vertical separator lines at trim boundaries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    if (trimStartFraction > 0) {
        const x = Math.round(trimStartFraction * width) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    if (trimEndFraction > 0) {
        const x = Math.round((1 - trimEndFraction) * width) - 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
}

// =============================================================================
// Component
// =============================================================================

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
    peaks: initialPeaks,
    audioUrl,
    progress = 0,
    height = 48,
    playedColor = '#FFFFFF',
    unplayedColor = 'rgba(255, 255, 255, 0.25)',
    onSeek,
    onPeaksComputed,
    compact = false,
    trimStartFraction = 0,
    trimEndFraction = 0,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isHoveringRef = useRef(false);
    const hoverXRef = useRef(0);

    const peakCount = compact ? COMPACT_PEAK_COUNT : PEAK_COUNT;
    const { peaks, isLoading } = usePeaks(initialPeaks, audioUrl, peakCount, onPeaksComputed);

    // Render waveform (no hover dependency)
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || peaks.length === 0) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(dpr, dpr);
        drawWaveform(ctx, peaks, rect.width, height, progress, playedColor, unplayedColor, trimStartFraction, trimEndFraction);
    }, [peaks, progress, height, playedColor, unplayedColor, trimStartFraction, trimEndFraction]);

    useEffect(() => {
        render();
    }, [render]);

    // Draw hover cursor line directly on overlay canvas (no React re-render)
    const drawHoverLine = useCallback(() => {
        const hoverCanvas = hoverCanvasRef.current;
        const container = containerRef.current;
        if (!hoverCanvas || !container) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        hoverCanvas.width = rect.width * dpr;
        hoverCanvas.height = height * dpr;
        hoverCanvas.style.width = `${rect.width}px`;
        hoverCanvas.style.height = `${height}px`;

        const ctx = hoverCanvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);

        if (isHoveringRef.current && onSeek) {
            ctx.scale(dpr, dpr);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(hoverXRef.current - 0.5, 0, 1, height);
        }
    }, [height, onSeek]);

    // Resize observer
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => {
            render();
            drawHoverLine();
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [render, drawHoverLine]);

    const handleClick = (e: React.MouseEvent) => {
        if (!onSeek || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(1, position)));
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        hoverXRef.current = e.clientX - rect.left;
        drawHoverLine();
    };

    const handleMouseEnter = () => {
        isHoveringRef.current = true;
    };

    const handleMouseLeave = () => {
        isHoveringRef.current = false;
        drawHoverLine();
    };

    return (
        <div
            ref={containerRef}
            className={`relative w-full ${onSeek ? 'cursor-pointer' : ''}`}
            style={{ height }}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
        >
            {isLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="flex gap-[3px] items-center h-full">
                        {Array.from({ length: compact ? 12 : 20 }).map((_, i) => (
                            <div
                                key={i}
                                className="w-[2px] bg-white/10 rounded-full animate-pulse"
                                style={{
                                    height: `${(compact ? LOADING_HEIGHTS_COMPACT : LOADING_HEIGHTS)[i]}%`,
                                    animationDelay: `${i * 0.05}s`,
                                }}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <canvas ref={canvasRef} className="block w-full h-full" />
                    <canvas ref={hoverCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                </>
            )}
        </div>
    );
};
