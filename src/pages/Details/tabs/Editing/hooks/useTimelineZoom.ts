import { useEffect, useRef, useState } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────
const DEFAULT_DURATION_S = 30 * 60;
const MAX_ZOOM = 8;
const ZOOM_SENSITIVITY = 0.015; // Heavier feel — less reactive to small gestures
const ZOOM_LERP = 0.09;         // Smoother interpolation — less twitchy

export interface UseTimelineZoomReturn {
    zoom: number;
    containerRef: React.RefObject<HTMLDivElement | null>;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    containerWidth: number;
    pxPerSecond: number;
    timelineWidth: number;
    timelineDuration: number;
}

/**
 * Smooth pinch-to-zoom with lerp animation and zoom-under-cursor anchoring.
 * Owns the container ResizeObserver and scroll element.
 */
export function useTimelineZoom(totalDuration: number): UseTimelineZoomReturn {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [zoom, setZoom] = useState(1);

    // Smooth zoom animation refs
    const targetZoomRef = useRef(1);
    const currentZoomRef = useRef(1);
    const zoomRafRef = useRef(0);
    // Zoom-under-cursor: anchor point
    const zoomAnchorTimeRef = useRef(0);     // timeline seconds under cursor
    const zoomAnchorOffsetRef = useRef(0);   // cursor px offset from scroll container left

    // Measure container
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
        ro.observe(el);
        setContainerWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    // Min zoom = 1.0 → 30 minutes always fits container. No zoom-out beyond that.
    const basePxPerSecond = containerWidth > 0 ? containerWidth / DEFAULT_DURATION_S : 0;
    const pxPerSecond = basePxPerSecond * zoom;
    const timelineDuration = Math.max(DEFAULT_DURATION_S, totalDuration);
    const timelineWidth = Math.round(timelineDuration * pxPerSecond);

    // ── Smooth zoom animation + Pinch-to-zoom ────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const animateZoom = () => {
            const current = currentZoomRef.current;
            const target = targetZoomRef.current;

            const newZoom = current + (target - current) * ZOOM_LERP;
            const isFinished = Math.abs(newZoom - target) < 0.001;
            const finalZoom = isFinished ? target : newZoom;

            currentZoomRef.current = finalZoom;
            setZoom(finalZoom);

            // Adjust scroll to keep anchor point under cursor
            const scrollEl = scrollRef.current;
            if (scrollEl && containerWidth > 0) {
                const newPxPerSec = (containerWidth / DEFAULT_DURATION_S) * finalZoom;
                const anchorPx = zoomAnchorTimeRef.current * newPxPerSec;
                scrollEl.scrollLeft = anchorPx - zoomAnchorOffsetRef.current;
            }

            if (isFinished) {
                zoomRafRef.current = 0;
            } else {
                zoomRafRef.current = requestAnimationFrame(animateZoom);
            }
        };

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();

            // Capture anchor: timeline position (seconds) under cursor
            const scrollEl = scrollRef.current;
            if (scrollEl) {
                const rect = scrollEl.getBoundingClientRect();
                const cursorOffsetFromLeft = e.clientX - rect.left;
                const cursorContentX = scrollEl.scrollLeft + cursorOffsetFromLeft;
                const currentPxPerSec = (containerWidth / DEFAULT_DURATION_S) * currentZoomRef.current;
                zoomAnchorTimeRef.current = currentPxPerSec > 0 ? cursorContentX / currentPxPerSec : 0;
                zoomAnchorOffsetRef.current = cursorOffsetFromLeft;
            }

            // Clamp delta for consistent speed, then apply exponential scaling
            const delta = Math.max(-100, Math.min(100, e.deltaY));
            const scaleFactor = Math.exp(-delta * ZOOM_SENSITIVITY);
            const newTarget = Math.max(1, Math.min(MAX_ZOOM, targetZoomRef.current * scaleFactor));

            targetZoomRef.current = newTarget;

            // Start animation if not running
            if (!zoomRafRef.current) {
                zoomRafRef.current = requestAnimationFrame(animateZoom);
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleWheel);
            if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
        };
    }, [containerWidth]);

    return {
        zoom,
        containerRef,
        scrollRef,
        containerWidth,
        pxPerSecond,
        timelineWidth,
        timelineDuration,
    };
}
