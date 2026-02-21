// =============================================================================
// WAVEFORM CANVAS: Web Audio API + Canvas Visualization
// =============================================================================

import React, { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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
    /** When true, shows draggable trim handles over the waveform */
    isTrimMode?: boolean;
    /** Called when the user drags trim handles: (startFraction, endFraction) in 0–1 range */
    onTrimChange?: (startFraction: number, endFraction: number) => void;
    /** Track duration in seconds — used to enforce minimum trim region */
    duration?: number;
    /**
     * Fade-out: fraction (0–1) of the full waveform where the fade starts.
     * 0 = no fade (disabled). The fade always ends at (1 - trimEndFraction).
     */
    fadeOutStartFrac?: number;
    /**
     * Bezier curvature of the fade-out:
     *   0 = linear, <0 = concave (slow→fast), >0 = convex (fast→slow / exponential feel)
     * Range: -1 to 1.
     */
    fadeOutCurvature?: number;
    /** Called when user drags the fade envelope handles */
    onFadeOutChange?: (startFrac: number, curvature: number) => void;
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
    useLayoutEffect(() => { onPeaksComputedRef.current = onPeaksComputed; });

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
    trimmedColor: string,
    lineColor: string,
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
    ctx.strokeStyle = lineColor;
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
    unplayedColor = 'var(--waveform-bar)',
    onSeek,
    onPeaksComputed,
    compact = false,
    trimStartFraction = 0,
    trimEndFraction = 0,
    isTrimMode = false,
    onTrimChange,
    duration = 0,
    fadeOutStartFrac = 0,
    fadeOutCurvature = 0,
    onFadeOutChange,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isHoveringRef = useRef(false);
    const hoverXRef = useRef(0);

    const peakCount = compact ? COMPACT_PEAK_COUNT : PEAK_COUNT;
    const { peaks, isLoading } = usePeaks(initialPeaks, audioUrl, peakCount, onPeaksComputed);

    // ── Trim handle drag state (refs for zero-rerender dragging) ────────
    const trimDraggingRef = useRef<'start' | 'end' | null>(null);
    const trimDragStartXRef = useRef(0);
    const trimDragOrigRef = useRef({ start: 0, end: 0 });
    const lastTrimDragEndRef = useRef(0);
    // Cached container width — set once on pointerdown to avoid reflow on every pointermove
    const dragContainerWidthRef = useRef(0);
    // Minimum trim region: at least 1 second (as fraction of total duration)
    const minTrimFraction = duration > 0 ? Math.min(1 / duration, 0.5) : 0.05;

    // ── Fade-out drag state ──────────────────────────────────────────
    const fadeDraggingRef = useRef<'start' | 'curve' | null>(null);
    const fadeDragStartXRef = useRef(0);
    const fadeDragStartYRef = useRef(0);
    const fadeDragOrigRef = useRef({ startFrac: 0, curvature: 0 });
    // Tracks live pushed positions of BOTH handles during a drag session.
    // Updated every pointermove frame so the non-dragged handle never snaps
    // back to its pointerdown value after being pushed by the other handle.
    const currentDragPosRef = useRef({ start: 0, end: 0 });

    // Stable ref to the latest drawHoverLine — populated after drawHoverLine is defined below
    const drawHoverLineRef = useRef<(() => void) | null>(null);

    // Live prop refs — drawHoverLine reads from these so it always has current values
    // even when called synchronously inside onMove before React has re-rendered
    const trimStartFractionRef = useRef(trimStartFraction);
    const trimEndFractionRef = useRef(trimEndFraction);
    const fadeOutStartFracRef = useRef(fadeOutStartFrac);
    const fadeOutCurvatureRef = useRef(fadeOutCurvature);
    const onFadeOutChangeRef = useRef(onFadeOutChange);
    useLayoutEffect(() => {
        trimStartFractionRef.current = trimStartFraction;
        trimEndFractionRef.current = trimEndFraction;
        fadeOutStartFracRef.current = fadeOutStartFrac;
        fadeOutCurvatureRef.current = fadeOutCurvature;
        onFadeOutChangeRef.current = onFadeOutChange;
    });

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

        // Resolve CSS custom properties (e.g. 'var(--waveform-bar)') at draw time
        // so colors automatically adapt when the user switches themes.
        const style = getComputedStyle(container);
        const resolveColor = (c: string) => {
            if (c.startsWith('var(')) {
                const name = c.slice(4, -1).trim();
                return style.getPropertyValue(name).trim() || c;
            }
            return c;
        };

        const resolvedPlayed = resolveColor(playedColor);
        const resolvedUnplayed = resolveColor(unplayedColor);
        const trimmedColor = resolveColor('var(--waveform-trim)');
        const lineColor = resolveColor('var(--waveform-line)');

        ctx.scale(dpr, dpr);
        drawWaveform(ctx, peaks, rect.width, height, progress, resolvedPlayed, resolvedUnplayed, trimmedColor, lineColor, trimStartFraction, trimEndFraction);
    }, [peaks, progress, height, playedColor, unplayedColor, trimStartFraction, trimEndFraction]);

    useEffect(() => {
        render();
    }, [render]);

    // Draw hover cursor line + fade-out envelope on overlay canvas
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
        ctx.save();
        ctx.scale(dpr, dpr);
        const w = rect.width;
        const h = height;

        // ── Resolve theme-aware colors once per draw ──
        const style = getComputedStyle(container);
        const cssVar = (name: string, fallback: string) =>
            style.getPropertyValue(name).trim() || fallback;


        // ── Trim handle time flags (only during active drag) ──
        const currentTrimStartFraction = trimStartFractionRef.current;
        const currentTrimEndFraction = trimEndFractionRef.current;

        if (isTrimMode && duration > 0 && trimDraggingRef.current !== null) {
            ctx.font = '500 10px Inter, system-ui, sans-serif';
            ctx.textBaseline = 'top';
            const padX = 4;
            const padY = 2;
            const flagH = 14;
            const flagY = 2;
            const flagColor = cssVar('--waveform-hover', 'rgba(128,128,128,0.5)');

            // Trim start flag
            if (currentTrimStartFraction > 0.005) {
                const startX = currentTrimStartFraction * w;
                const startSec = currentTrimStartFraction * duration;
                const label = `${Math.floor(startSec / 60)}:${Math.floor(startSec % 60).toString().padStart(2, '0')}`;
                const metrics = ctx.measureText(label);
                const flagW = metrics.width + padX * 2;
                const flagX = startX + 4;

                ctx.fillStyle = flagColor;
                ctx.beginPath();
                ctx.roundRect(flagX, flagY, flagW, flagH, 3);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillText(label, flagX + padX, flagY + padY);
            }

            // Trim end flag
            if (currentTrimEndFraction > 0.005) {
                const endX = (1 - currentTrimEndFraction) * w;
                const endSec = (1 - currentTrimEndFraction) * duration;
                const label = `${Math.floor(endSec / 60)}:${Math.floor(endSec % 60).toString().padStart(2, '0')}`;
                const metrics = ctx.measureText(label);
                const flagW = metrics.width + padX * 2;
                const flagX = endX - flagW - 4;

                ctx.fillStyle = flagColor;
                ctx.beginPath();
                ctx.roundRect(flagX, flagY, flagW, flagH, 3);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillText(label, flagX + padX, flagY + padY);
            }
        }

        // ── Draw fade-out envelope (reads from live refs — always current even on sync call) ──
        const currentFadeOutStartFrac = fadeOutStartFracRef.current;
        const currentFadeOutCurvature = fadeOutCurvatureRef.current;
        const currentOnFadeOutChange = onFadeOutChangeRef.current;

        if (isTrimMode && currentFadeOutStartFrac > 0 && currentOnFadeOutChange) {
            const fadeEndX = (1 - currentTrimEndFraction) * w;
            const fadeStartX = currentFadeOutStartFrac * w;

            if (fadeStartX < fadeEndX) {
                const cpX = (fadeStartX + fadeEndX) / 2;
                const cpY = Math.max(5, Math.min(h - 5, h / 2 - (currentFadeOutCurvature * h / 2)));

                ctx.beginPath();
                ctx.moveTo(fadeStartX, 0);
                ctx.quadraticCurveTo(cpX, cpY, fadeEndX, h);
                ctx.lineTo(fadeEndX, 0);
                ctx.closePath();
                ctx.fillStyle = cssVar('--waveform-fade-fill', 'rgba(0,0,0,0.22)');
                ctx.fill();

                // Envelope top line
                ctx.beginPath();
                ctx.moveTo(fadeStartX, 0);
                ctx.quadraticCurveTo(cpX, cpY, fadeEndX, h);
                ctx.strokeStyle = cssVar('--waveform-fade-line', 'rgba(255,255,255,0.4)');
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Fade start handle (vertical tick + circle)
                ctx.strokeStyle = cssVar('--waveform-fade-handle', 'rgba(255,255,255,0.7)');
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(fadeStartX, 0);
                ctx.lineTo(fadeStartX, h);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(fadeStartX, h / 2, 4, 0, Math.PI * 2);
                ctx.fillStyle = cssVar('--waveform-fade-handle-bg', 'rgba(255,255,255,0.9)');
                ctx.fill();

                // Curvature drag dot (midpoint of visible envelope line)
                ctx.beginPath();
                ctx.arc(cpX, cpY, 5, 0, Math.PI * 2);
                ctx.fillStyle = cssVar('--waveform-fade-handle-bg', 'rgba(255,255,255,0.9)');
                ctx.fill();
                ctx.strokeStyle = cssVar('--waveform-fade-dot-stroke', 'rgba(0,0,0,0.3)');
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // ── Hover seek line + time flag (hidden during trim/fade drag) ──
        if (isHoveringRef.current && onSeek && !trimDraggingRef.current && !fadeDraggingRef.current) {
            const hx = hoverXRef.current;
            const hoverColor = cssVar('--waveform-hover', 'rgba(128,128,128,0.5)');
            ctx.fillStyle = hoverColor;
            ctx.fillRect(hx - 0.5, 0, 1, h);

            // Time flag (hidden when it would overlap a trim line)
            if (duration > 0) {
                const timeSec = (hx / w) * duration;
                const mins = Math.floor(timeSec / 60);
                const secs = Math.floor(timeSec % 60);
                const label = `${mins}:${secs.toString().padStart(2, '0')}`;

                ctx.font = '500 10px Inter, system-ui, sans-serif';
                const metrics = ctx.measureText(label);
                const padX = 4;
                const padY = 2;
                const flagW = metrics.width + padX * 2;
                const flagH = 14;
                const flagY = 2;
                const gap = 4;
                // Flip to left side if too close to right edge
                const flagX = hx + flagW + gap > w ? hx - flagW - gap : hx + gap;
                const flagRight = flagX + flagW;

                // Check if hover visual zone (line + flag) overlaps either trim line
                const hoverLeft = Math.min(hx, flagX);
                const hoverRight = Math.max(hx, flagRight);
                const trimStartX = currentTrimStartFraction * w;
                const trimEndX = (1 - currentTrimEndFraction) * w;
                const overlapsTrimStart = currentTrimStartFraction > 0.005
                    && trimStartX >= hoverLeft && trimStartX <= hoverRight;
                const overlapsTrimEnd = currentTrimEndFraction > 0.005
                    && trimEndX >= hoverLeft && trimEndX <= hoverRight;

                if (!overlapsTrimStart && !overlapsTrimEnd) {
                    // Background pill
                    ctx.fillStyle = cssVar('--waveform-hover', 'rgba(128,128,128,0.5)');
                    ctx.beginPath();
                    ctx.roundRect(flagX, flagY, flagW, flagH, 3);
                    ctx.fill();

                    // Text
                    ctx.fillStyle = '#fff';
                    ctx.textBaseline = 'top';
                    ctx.fillText(label, flagX + padX, flagY + padY);
                }
            }
        }

        ctx.restore();
    }, [height, onSeek, isTrimMode, duration]); // fade/trim props read via refs — no need to list here



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

    // Theme-change observer — re-draw when .dark class toggles on <html>.
    // Canvas pixels are static: CSS variable updates don't trigger a redraw
    // automatically, so we watch for class attribute changes on the root element.
    useEffect(() => {
        const observer = new MutationObserver(() => render());
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });
        return () => observer.disconnect();
    }, [render]);

    // Redraw hover canvas whenever fade/trim state changes — useLayoutEffect so it
    // fires synchronously before paint (unlike useEffect which fires after)
    useLayoutEffect(() => {
        drawHoverLineRef.current = drawHoverLine;
        drawHoverLine();
    }, [drawHoverLine]);

    // Redraw fade envelope immediately when fade state changes via button toggle
    // (drawHoverLine reads these from refs, so its identity doesn't change — trigger manually)
    useLayoutEffect(() => {
        drawHoverLineRef.current?.();
    }, [fadeOutStartFrac, fadeOutCurvature, trimEndFraction]);

    // ── Fade-out drag handler ──────────────────────────────────────
    const handleFadePointerDown = useCallback((e: React.PointerEvent, type: 'start' | 'curve') => {
        if (!onFadeOutChange || !containerRef.current) return;
        if (trimDraggingRef.current !== null) return;
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        fadeDraggingRef.current = type;
        fadeDragStartXRef.current = e.clientX;
        fadeDragStartYRef.current = e.clientY;
        fadeDragOrigRef.current = { startFrac: fadeOutStartFrac, curvature: fadeOutCurvature };
        // Cache width once — avoids layout reflow on every pointermove
        dragContainerWidthRef.current = containerRef.current.getBoundingClientRect().width;
        isHoveringRef.current = false;
        drawHoverLineRef.current?.();

        const onMove = (ev: PointerEvent) => {
            if (!fadeDraggingRef.current || !containerRef.current) return;
            const containerWidth = dragContainerWidthRef.current;

            if (fadeDraggingRef.current === 'start') {
                const deltaFrac = (ev.clientX - fadeDragStartXRef.current) / containerWidth;
                const minFrac = trimStartFraction + 0.05;
                const maxFrac = (1 - trimEndFraction) - 0.05;
                const newStart = Math.max(minFrac, Math.min(maxFrac, fadeDragOrigRef.current.startFrac + deltaFrac));
                // Update live ref immediately so drawHoverLine sees the new value
                fadeOutStartFracRef.current = newStart;
                onFadeOutChange(newStart, fadeDragOrigRef.current.curvature);
            } else {
                const deltaY = fadeDragStartYRef.current - ev.clientY;
                const newCurvature = Math.max(-1, Math.min(1,
                    fadeDragOrigRef.current.curvature + deltaY / (height * 2),
                ));
                // Update live ref immediately so drawHoverLine sees the new value
                fadeOutCurvatureRef.current = newCurvature;
                onFadeOutChange(fadeDragOrigRef.current.startFrac, newCurvature);
            }
            // Synchronously redraw with updated refs (before React re-render)
            drawHoverLineRef.current?.();
        };

        const onUp = (ev: PointerEvent) => {
            (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
            fadeDraggingRef.current = null;
            lastTrimDragEndRef.current = Date.now();
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                hoverXRef.current = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
            }
            isHoveringRef.current = true;
            drawHoverLineRef.current?.();
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }, [onFadeOutChange, fadeOutStartFrac, fadeOutCurvature, trimStartFraction, trimEndFraction, height]);

    // ── Trim handle pointer events ─────────────────────────────────────
    const handleTrimPointerDown = useCallback((e: React.PointerEvent, edge: 'start' | 'end') => {
        if (!onTrimChange || !containerRef.current) return;
        if (fadeDraggingRef.current !== null) return;
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        trimDraggingRef.current = edge;
        trimDragStartXRef.current = e.clientX;
        trimDragOrigRef.current = { start: trimStartFraction, end: trimEndFraction };
        // Cache width once — avoids layout reflow on every pointermove
        dragContainerWidthRef.current = containerRef.current.getBoundingClientRect().width;
        // Initialize live position tracker to current prop values
        currentDragPosRef.current = { start: trimStartFraction, end: trimEndFraction };
        isHoveringRef.current = false;
        drawHoverLineRef.current?.();

        const onMove = (ev: PointerEvent) => {
            if (!trimDraggingRef.current || !containerRef.current) return;
            const containerWidth = dragContainerWidthRef.current;
            const deltaPx = ev.clientX - trimDragStartXRef.current;
            const deltaFrac = deltaPx / containerWidth;
            const { start: origStart, end: origEnd } = trimDragOrigRef.current;

            let newStart: number;
            let newEnd: number;

            if (trimDraggingRef.current === 'start') {
                const rawStart = Math.max(0, Math.min(1 - minTrimFraction, origStart + deltaFrac));
                const curEnd = currentDragPosRef.current.end;
                const activeRegion = 1 - curEnd - rawStart;
                if (activeRegion >= minTrimFraction) {
                    newStart = rawStart;
                    newEnd = curEnd;
                } else {
                    newStart = rawStart;
                    newEnd = Math.max(0, 1 - rawStart - minTrimFraction);
                }
            } else {
                const rawEnd = Math.max(0, Math.min(1 - minTrimFraction, origEnd - deltaFrac));
                const curStart = currentDragPosRef.current.start;
                const activeRegion = 1 - rawEnd - curStart;
                if (activeRegion >= minTrimFraction) {
                    newStart = curStart;
                    newEnd = rawEnd;
                } else {
                    newEnd = rawEnd;
                    newStart = Math.max(0, 1 - rawEnd - minTrimFraction);
                }
            }

            currentDragPosRef.current = { start: newStart, end: newEnd };
            onTrimChange(newStart, newEnd);

            // ── Push fade-out start leftward if trim end squashes the fade zone ──
            const curFadeStart = fadeOutStartFracRef.current;
            const curFadeCurvature = fadeOutCurvatureRef.current;
            const fadeCallback = onFadeOutChangeRef.current;
            if (curFadeStart > 0 && fadeCallback) {
                const trimRightEdge = 1 - newEnd;   // visual right edge of active region
                const MIN_FADE_FRAC = 0.05;          // minimum 5% fade width
                if (trimRightEdge - curFadeStart < MIN_FADE_FRAC) {
                    // Push fade start leftward, but don't let it go past trim start + 5%
                    const pushedFadeStart = Math.max(newStart + MIN_FADE_FRAC, trimRightEdge - MIN_FADE_FRAC);
                    fadeOutStartFracRef.current = pushedFadeStart;
                    fadeCallback(pushedFadeStart, curFadeCurvature);
                }
            }

            // Synchronously redraw fade envelope — avoids 1-frame lag from React re-render cycle
            drawHoverLineRef.current?.();
        };


        const onUp = (ev: PointerEvent) => {
            (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
            trimDraggingRef.current = null;
            lastTrimDragEndRef.current = Date.now();
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                hoverXRef.current = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
            }
            isHoveringRef.current = true;
            drawHoverLineRef.current?.();
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }, [onTrimChange, trimStartFraction, trimEndFraction, minTrimFraction]);

    const handleClick = (e: React.MouseEvent) => {
        if (!onSeek || !containerRef.current) return;
        // Suppress click-to-seek right after a trim handle drag
        if (Date.now() - lastTrimDragEndRef.current < 200) return;
        const rect = containerRef.current.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(1, position)));
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        hoverXRef.current = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        drawHoverLineRef.current?.();
    };

    const handleMouseEnter = () => {
        isHoveringRef.current = true;
    };

    const handleMouseLeave = () => {
        isHoveringRef.current = false;
        drawHoverLineRef.current?.();
    };

    // Handle hit zone width (px) — generous for easy grabbing
    const HANDLE_HIT_ZONE = 12;

    // Pre-compute fade handle positions (avoids IIFE in JSX)
    const showFadeHandles = isTrimMode && !!onFadeOutChange && fadeOutStartFrac > 0;
    const fadeEndFrac = 1 - trimEndFraction;
    const fadeCpFrac = (fadeOutStartFrac + fadeEndFrac) / 2;
    const fadeCpYPct = Math.max(0, Math.min(100, (0.5 - fadeOutCurvature * 0.5) * 100));

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
                                className="w-[2px] bg-[var(--waveform-bar)] rounded-full animate-pulse"
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

                    {/* ── Trim handles (visible only in trim mode) ── */}
                    {isTrimMode && (
                        <>
                            {/* Left (start) handle */}
                            <div
                                className="absolute top-0 h-full cursor-col-resize z-30 group/trim-start"
                                style={{
                                    left: `calc(${trimStartFraction * 100}% - ${HANDLE_HIT_ZONE / 2}px)`,
                                    width: HANDLE_HIT_ZONE,
                                }}
                                onPointerDown={(e) => handleTrimPointerDown(e, 'start')}
                            >
                                {/* Visual bar */}
                                <div
                                    className="absolute top-0 h-full w-[3px] rounded-full
                                               bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.3)]
                                               group-hover/trim-start:bg-white group-hover/trim-start:shadow-[0_0_10px_rgba(255,255,255,0.5)]
                                               transition-all duration-150"
                                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                                />
                                {/* Grab dot */}
                                <div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                                               w-2.5 h-2.5 rounded-full bg-white border border-white/40
                                               shadow-md opacity-80 group-hover/trim-start:opacity-100
                                               transition-opacity"
                                />
                            </div>

                            {/* Right (end) handle */}
                            <div
                                className="absolute top-0 h-full cursor-col-resize z-30 group/trim-end"
                                style={{
                                    left: `calc(${(1 - trimEndFraction) * 100}% - ${HANDLE_HIT_ZONE / 2}px)`,
                                    width: HANDLE_HIT_ZONE,
                                }}
                                onPointerDown={(e) => handleTrimPointerDown(e, 'end')}
                            >
                                {/* Visual bar */}
                                <div
                                    className="absolute top-0 h-full w-[3px] rounded-full
                                               bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.3)]
                                               group-hover/trim-end:bg-white group-hover/trim-end:shadow-[0_0_10px_rgba(255,255,255,0.5)]
                                               transition-all duration-150"
                                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                                />
                                {/* Grab dot */}
                                <div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                                               w-2.5 h-2.5 rounded-full bg-white border border-white/40
                                               shadow-md opacity-80 group-hover/trim-end:opacity-100
                                               transition-opacity"
                                />
                            </div>

                            {/* ── Fade-out handles (drag hit areas) ── */}
                            {showFadeHandles && (
                                <>
                                    {/* Fade start drag strip */}
                                    <div
                                        className="absolute top-0 h-full cursor-col-resize z-20"
                                        style={{
                                            left: `calc(${fadeOutStartFrac * 100}% - 6px)`,
                                            width: 12,
                                        }}
                                        title="Drag to move fade-out start"
                                        onPointerDown={(e) => handleFadePointerDown(e, 'start')}
                                    />
                                    {/* Curvature drag dot */}
                                    <div
                                        className="absolute z-20 cursor-ns-resize"
                                        style={{
                                            left: `calc(${fadeCpFrac * 100}% - 8px)`,
                                            top: `calc(${fadeCpYPct}% - 8px)`,
                                            width: 16,
                                            height: 16,
                                            borderRadius: '50%',
                                        }}
                                        title="Drag up/down to adjust fade curve"
                                        onPointerDown={(e) => handleFadePointerDown(e, 'curve')}
                                    />
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};
