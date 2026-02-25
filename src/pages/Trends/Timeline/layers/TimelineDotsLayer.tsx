import React, { useRef, useLayoutEffect, useEffect, useState, useCallback } from 'react';
import type { TrendVideo, VideoPosition } from '../../../../core/types/trends';
import { getDotStyle } from '../../../../core/utils/trendStyles';
import type { Transform } from '../utils/timelineMath';
import {
    ANIMATION_DURATION_MS,
    DOT_HIT_BUFFER_PX,
    HOVER_DEBOUNCE_MS,
    MIN_INTERACTION_SIZE_PX,
    TOOLTIP_SHOW_DELAY_MS,
    LOD_SHOW_THUMBNAIL
} from '../utils/timelineConstants';

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

/** Draw a soft radial glow on canvas — shared by selection and hover effects. */
const drawGlow = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    innerRadius: number,
    progress: number,
    glowRgb: string
) => {
    const glowRadius = innerRadius * 3.5;
    const gradient = ctx.createRadialGradient(x, y, innerRadius * 0.5, x, y, glowRadius);
    const alpha = 0.3 * progress;
    gradient.addColorStop(0, `rgba(${glowRgb}, ${alpha})`);
    gradient.addColorStop(0.15, `rgba(${glowRgb}, ${alpha * 0.7})`);
    gradient.addColorStop(0.3, `rgba(${glowRgb}, ${alpha * 0.45})`);
    gradient.addColorStop(0.5, `rgba(${glowRgb}, ${alpha * 0.2})`);
    gradient.addColorStop(0.7, `rgba(${glowRgb}, ${alpha * 0.08})`);
    gradient.addColorStop(0.85, `rgba(${glowRgb}, ${alpha * 0.02})`);
    gradient.addColorStop(1, `rgba(${glowRgb}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.fill();
};

/**
 * Hover scale factor for dots (matches VideoNode's CSS transform: scale(1.25))
 * Creates visual feedback that a dot is interactive.
 */
const HOVER_SCALE_FACTOR = 1.25;

/**
 * Delay before clearing hover state when mouse leaves (ms).
 * Prevents flickering when cursor moves between dots quickly.
 */
const MOUSE_LEAVE_DELAY_MS = 200;

/**
 * Minimum scale at which dots are rendered larger to compensate for zoom out.
 * Below this threshold, dots would become invisible, so we apply inverse scaling.
 */
const DOT_SCALE_COMPENSATION_THRESHOLD = 0.20;

/**
 * Minimum interaction size ensures small dots are still clickable.
 * Even if a dot is visually 4px, the hit area will be at least this size.
 */
const MIN_VISUAL_RADIUS = 12;

/**
 * Calculate visual radius for a dot based on its base size, zoom, and scale compensation.
 * Shared between render loop and hit detection — minSize differs per use case.
 */
const getVisualRadius = (
    baseSize: number,
    minSize: number,
    dotScaleFactor: number,
    currentScale: number
) => {
    const effectiveSize = Math.max(baseSize, minSize);
    return (effectiveSize / 2) * dotScaleFactor * currentScale;
};

// =============================================================================
// TYPES
// =============================================================================

interface TimelineDotsLayerProps {
    /** Array of video positions in normalized coordinates (0-1) */
    videoPositions: VideoPosition[];
    /** Current pan/zoom transform state */
    transform: Transform;
    /** World coordinate width (computed from date range) */
    worldWidth: number;
    /** World coordinate height (computed from view count range) */
    worldHeight: number;
    /** Set of currently selected video IDs */
    activeVideoIds: Set<string>;
    /** Function to get percentile group for styling (e.g., 'top1%', 'top10%') */
    getPercentileGroup: (videoId: string) => string | undefined;
    /** Callback when user hovers over a video dot (for tooltip) */
    onHoverVideo: (data: { video: TrendVideo; x: number; y: number; width: number; height: number } | null) => void;
    /** Callback when user clicks a video dot */
    onClickVideo: (video: TrendVideo, e: React.MouseEvent) => void;
    /** Callback when user double-clicks a video dot (for zoom) */
    onDoubleClickVideo: (video: TrendVideo, worldX: number, worldY: number, e: React.MouseEvent) => void;
    /** Callback when user clicks empty space (to clear selection) */
    onClickEmpty?: () => void;
    /** Vertical spread factor (0 = compressed, 1 = full spread). Affects hit buffer. */
    verticalSpread?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * TimelineDotsLayer - High-performance canvas-based dot renderer for timeline.
 *
 * ## Purpose:
 * Renders thousands of video dots efficiently using HTML5 Canvas.
 * Used at zoom levels < LOD_SHOW_THUMBNAIL (0.25) where DOM-based VideoNodes
 * would be too slow. Above this threshold, TimelineVideoLayer takes over.
 *
 * ## Key Features:
 * - **Canvas Rendering**: 60fps with 10,000+ dots
 * - **Smart Hit Detection**: Z-order aware (picks largest/topmost dot under cursor)
 * - **Smooth Animations**: Hover scale and selection glow with eased transitions
 * - **Viewport Culling**: Only renders dots visible on screen + buffer
 * - **DPR Support**: Crisp rendering on Retina displays
 *
 * ## Rendering Strategy (Two-Pass):
 * 1. **Pass 1**: Draw all non-hovered dots (background layer)
 * 2. **Pass 2**: Draw hovered/selected dots on top with glow effects
 *
 * This ensures hovered elements always render above others without managing
 * explicit z-index in canvas context.
 *
 * ## Hit Detection Strategy:
 * When dots overlap (low verticalSpread), we collect ALL dots under cursor
 * and pick the one with LARGEST baseSize (most views = highest z-order).
 * This matches rendering order where larger dots are drawn last (on top).
 */
export const TimelineDotsLayer: React.FC<TimelineDotsLayerProps> = ({
    videoPositions,
    transform,
    worldWidth,
    worldHeight,
    activeVideoIds,
    getPercentileGroup,
    onHoverVideo,
    onClickVideo,
    onDoubleClickVideo,
    onClickEmpty,
    verticalSpread = 1.0
}) => {
    // =========================================================================
    // REFS
    // =========================================================================

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Timeout refs for debouncing
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFoundIdRef = useRef<string | null>(null);

    // Animation refs
    const animRef = useRef<{ id: number }>({ id: 0 });
    const selectionAnimRef = useRef<{ id: number }>({ id: 0 });
    const animTargetRef = useRef(0);
    const animStartRef = useRef(0);
    const animStartTimeRef = useRef(0);

    // Cached CSS variable for glow color (avoids getComputedStyle in render loop)
    const glowRgbRef = useRef('255, 255, 255');

    // =========================================================================
    // STATE
    // =========================================================================

    const [dpr, setDpr] = useState(1);

    // Hover animation state
    const [internalFocusedId, setInternalFocusedId] = useState<string | null>(null);
    const [lastFocusedId, setLastFocusedId] = useState<string | null>(null);
    const [animProgress, setAnimProgress] = useState(0);

    // Selection animation state (tracks animated selection transitions)
    const [selectionAnimProgress, setSelectionAnimProgress] = useState<Map<string, number>>(new Map());
    const [prevIds, setPrevIds] = useState<Set<string>>(new Set());

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    // Set device pixel ratio for crisp Retina rendering
    useEffect(() => {
        setDpr(window.devicePixelRatio || 1);
    }, []);

    // Cache --dot-glow-rgb CSS variable and update on theme change
    useEffect(() => {
        const readGlowRgb = () => {
            const raw = getComputedStyle(document.documentElement)
                .getPropertyValue('--dot-glow-rgb').trim();
            if (raw) glowRgbRef.current = raw;
        };
        readGlowRgb();

        // Watch for class/attribute changes on <html> (theme toggle)
        const observer = new MutationObserver(readGlowRgb);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme']
        });
        return () => observer.disconnect();
    }, []);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
        };
    }, []);

    // =========================================================================
    // ANIMATION HELPERS
    // =========================================================================

    /**
     * Cubic ease-out function for smooth deceleration.
     * Creates natural-feeling animations that start fast and slow to a stop.
     */
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    // =========================================================================
    // HOVER ANIMATION
    // =========================================================================

    /**
     * Bidirectional hover animation effect.
     * Animates smoothly from current state to target (0 or 1) when focus changes.
     */
    useEffect(() => {
        if (internalFocusedId) {
            // Animate IN: from current value to 1
            animTargetRef.current = 1;
            animStartRef.current = animProgress;
            animStartTimeRef.current = performance.now();

            const animateIn = (time: number) => {
                const elapsed = time - animStartTimeRef.current;
                const rawProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
                const easedProgress = easeOutCubic(rawProgress);
                const newValue = animStartRef.current + (1 - animStartRef.current) * easedProgress;
                setAnimProgress(newValue);

                if (rawProgress < 1) {
                    animRef.current.id = requestAnimationFrame(animateIn);
                }
            };

            cancelAnimationFrame(animRef.current.id);
            animRef.current.id = requestAnimationFrame(animateIn);

        } else if (lastFocusedId) {
            // Animate OUT: from current value to 0
            animTargetRef.current = 0;
            animStartRef.current = animProgress;
            animStartTimeRef.current = performance.now();

            const animateOut = (time: number) => {
                const elapsed = time - animStartTimeRef.current;
                const rawProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
                const easedProgress = easeOutCubic(rawProgress);
                const newValue = animStartRef.current * (1 - easedProgress);
                setAnimProgress(newValue);

                if (rawProgress < 1) {
                    animRef.current.id = requestAnimationFrame(animateOut);
                } else {
                    // Animation complete - clear lastFocusedId to stop rendering glow
                    setLastFocusedId(null);
                }
            };

            animRef.current.id = requestAnimationFrame(animateOut);
        }

        const currentAnimRef = animRef.current;
        return () => cancelAnimationFrame(currentAnimRef.id);
    }, [internalFocusedId, lastFocusedId, animProgress]);

    // =========================================================================
    // SELECTION ANIMATION
    // =========================================================================

    /**
     * Animate selection state changes when activeVideoIds changes.
     * Uses useEffect to avoid impure function calls (performance.now) during render.
     */
    useEffect(() => {
        // Compare current vs previous selection
        let hasChanges = false;
        if (prevIds.size !== activeVideoIds.size) {
            hasChanges = true;
        } else {
            for (const id of activeVideoIds) {
                if (!prevIds.has(id)) {
                    hasChanges = true;
                    break;
                }
            }
        }

        if (!hasChanges) return;

        // Find newly selected and deselected dots
        const newlySelected: string[] = [];
        const newlyDeselected: string[] = [];

        activeVideoIds.forEach(id => {
            if (!prevIds.has(id)) newlySelected.push(id);
        });
        prevIds.forEach(id => {
            if (!activeVideoIds.has(id)) newlyDeselected.push(id);
        });

        // Update tracking state
        setPrevIds(new Set(activeVideoIds));

        // Initialize animation progress for transitioning dots
        setSelectionAnimProgress(prev => {
            const next = new Map(prev);
            newlySelected.forEach(id => {
                // If dot was hovered, preserve animation progress for smooth transition
                const wasHovered = (internalFocusedId === id || lastFocusedId === id);
                next.set(id, prev.get(id) ?? (wasHovered ? animProgress : 0));
            });
            newlyDeselected.forEach(id => next.set(id, prev.get(id) ?? 1));
            return next;
        });

        // Start selection animation loop (performance.now is safe inside useEffect)
        const startTime = performance.now();
        const animate = (time: number) => {
            const elapsed = time - startTime;
            const rawProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
            const easedProgress = easeOutCubic(rawProgress);

            setSelectionAnimProgress(prev => {
                const next = new Map(prev);
                newlySelected.forEach(id => next.set(id, easedProgress));
                newlyDeselected.forEach(id => next.set(id, 1 - easedProgress));
                return next;
            });

            if (rawProgress < 1) {
                selectionAnimRef.current.id = requestAnimationFrame(animate);
            } else {
                // Cleanup completed deselection animations
                setSelectionAnimProgress(prev => {
                    const next = new Map(prev);
                    newlyDeselected.forEach(id => next.delete(id));
                    return next;
                });
            }
        };

        const currentSelectionAnimRef = selectionAnimRef.current;
        cancelAnimationFrame(currentSelectionAnimRef.id);
        currentSelectionAnimRef.id = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(currentSelectionAnimRef.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- prevIds is tracked internally, animProgress/focusedIds are captured at animation start
    }, [activeVideoIds]);

    // =========================================================================
    // VIEWPORT CULLING
    // =========================================================================

    /**
     * Calculate visible world coordinate bounds for culling off-screen dots.
     * Includes 500px buffer to prevent popping at edges during pan.
     */
    const getVisibleWorldBounds = useCallback(() => {
        if (!containerRef.current) return { start: 0, end: 0 };
        const { width } = containerRef.current.getBoundingClientRect();
        const start = (-transform.offsetX - 500) / transform.scale;
        const end = (width - transform.offsetX + 500) / transform.scale;
        return { start, end };
    }, [transform.offsetX, transform.scale]);

    // =========================================================================
    // CANVAS RENDERING
    // =========================================================================

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !containerRef.current) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
            console.warn('[TimelineDotsLayer] Failed to get 2D canvas context');
            return;
        }

        const { width, height } = containerRef.current.getBoundingClientRect();

        // Resize canvas for DPR (crisp Retina rendering)
        const displayWidth = Math.floor(width * dpr);
        const displayHeight = Math.floor(height * dpr);

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        // Reset transform and clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const { start, end } = getVisibleWorldBounds();

        // Calculate dot scale factor (compensate for zoom out)
        const currentScale = transform.scale || 0.001;
        const dotScaleFactor = Math.max(1, DOT_SCALE_COMPENSATION_THRESHOLD / currentScale);



        // Track hovered item for second pass rendering
        let activeHoverItem: { pos: VideoPosition; x: number; y: number; r: number } | null = null;

        // --- PASS 1: Draw Non-Hovered Dots (Background Layer) ---
        for (const pos of videoPositions) {
            const worldX = pos.xNorm * worldWidth;
            if (worldX < start || worldX > end) continue; // Viewport culling

            const worldY = pos.yNorm * worldHeight;
            const screenX = worldX * transform.scale + transform.offsetX;
            const screenY = worldY * transform.scale + transform.offsetY;

            const percentileGroup = getPercentileGroup(pos.video.id);
            const style = getDotStyle(percentileGroup);
            const visualRadius = getVisualRadius(style.size, MIN_VISUAL_RADIUS, dotScaleFactor, currentScale);

            // Check if this dot is being hover-animated (skip for second pass)
            const isActive = activeVideoIds.has(pos.video.id);
            const animatingId = internalFocusedId || lastFocusedId;
            if (!isActive && pos.video.id === animatingId && animProgress > 0) {
                activeHoverItem = { pos, x: screenX, y: screenY, r: visualRadius };
                continue;
            }

            // Render selected dots with glow and ring
            if (isActive || selectionAnimProgress.has(pos.video.id)) {
                const selectProgress = selectionAnimProgress.get(pos.video.id) ?? (isActive ? 1 : 0);
                if (selectProgress <= 0) continue;

                // Animated scale: 1.0 → 1.25
                const activeScale = 1.0 + (0.25 * selectProgress);
                const activeRadius = visualRadius * activeScale;

                // Soft outer glow (radial gradient)
                const glowRgb = glowRgbRef.current;
                drawGlow(ctx, screenX, screenY, activeRadius, selectProgress, glowRgb);

                // Selection ring
                ctx.beginPath();
                ctx.arc(screenX, screenY, activeRadius * 1.1, 0, 2 * Math.PI);
                ctx.strokeStyle = `rgba(${glowRgb}, ${0.9 * selectProgress})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Main dot with brightness boost
                ctx.beginPath();
                ctx.arc(screenX, screenY, activeRadius, 0, 2 * Math.PI);
                ctx.fillStyle = style.colorHex;
                const brightness = 1 + (0.2 * selectProgress);
                ctx.filter = `brightness(${brightness})`;
                ctx.fill();
                ctx.filter = 'none';
                continue;
            }

            // Regular non-hovered dot
            ctx.beginPath();
            ctx.arc(screenX, screenY, visualRadius, 0, 2 * Math.PI);
            ctx.fillStyle = style.colorHex;
            ctx.fill();
        }

        // --- PASS 2: Draw Hovered Dot (Top Layer) ---
        if (activeHoverItem) {
            const { pos, x: screenX, y: screenY, r: visualRadius } = activeHoverItem;
            const percentileGroup = getPercentileGroup(pos.video.id);
            const style = getDotStyle(percentileGroup);

            // Animated scale: 1.0 → 1.25
            const scale = 1.0 + (0.25 * animProgress);
            const animatedRadius = visualRadius * scale;

            // Soft outer glow (matches selection glow style)
            if (animProgress > 0) {
                const glowRgb = glowRgbRef.current;
                drawGlow(ctx, screenX, screenY, animatedRadius, animProgress, glowRgb);
            }

            // Main dot
            ctx.beginPath();
            ctx.arc(screenX, screenY, animatedRadius, 0, 2 * Math.PI);
            ctx.fillStyle = style.colorHex;
            ctx.fill();
        }

    }, [
        videoPositions, transform, worldWidth, worldHeight,
        activeVideoIds, internalFocusedId, lastFocusedId,
        dpr, animProgress, selectionAnimProgress,
        getPercentileGroup, getVisibleWorldBounds
    ]);

    // =========================================================================
    // INTERACTION HANDLERS
    // =========================================================================

    /**
     * Unified handler for hover, click, and double-click interactions.
     * Uses geometric hit testing on canvas coordinates.
     */
    const handleInteraction = (e: React.MouseEvent, type: 'hover' | 'click' | 'dblclick') => {
        // When thumbnails are visible (high zoom), VideoLayer handles interactions
        // This prevents "blinking" from both layers fighting for hover state
        if (transform.scale >= LOD_SHOW_THUMBNAIL) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { start, end } = getVisibleWorldBounds();
        const currentScale = transform.scale || 0.001;
        const dotScaleFactor = Math.max(1, DOT_SCALE_COMPENSATION_THRESHOLD / currentScale);



        /**
         * Hit detection with z-order priority.
         * When verticalSpread is low, dots overlap - we pick the largest (topmost).
         */
        const scaledHitBuffer = DOT_HIT_BUFFER_PX * Math.max(0.1, verticalSpread);
        const candidates: Array<{ pos: VideoPosition; dist: number }> = [];

        for (let i = 0; i < videoPositions.length; i++) {
            const pos = videoPositions[i];
            const worldX = pos.xNorm * worldWidth;
            if (worldX < start || worldX > end) continue;

            const worldY = pos.yNorm * worldHeight;
            const screenX = worldX * transform.scale + transform.offsetX;
            const screenY = worldY * transform.scale + transform.offsetY;

            const percentileGroup = getPercentileGroup(pos.video.id);
            const style = getDotStyle(percentileGroup);
            const visualRadius = getVisualRadius(style.size, MIN_INTERACTION_SIZE_PX, dotScaleFactor, currentScale);

            const dx = x - screenX;
            const dy = y - screenY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= visualRadius + scaledHitBuffer) {
                candidates.push({ pos, dist });
            }
        }

        // Sort by size (largest first), then by distance (closest first)
        let found: VideoPosition | null = null;
        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                const sizeDiff = b.pos.baseSize - a.pos.baseSize;
                if (sizeDiff !== 0) return sizeDiff;
                return a.dist - b.dist;
            });
            found = candidates[0].pos;
        }

        // --- HOVER ---
        if (type === 'hover') {
            const foundId = found?.video.id || null;

            if (foundId !== lastFoundIdRef.current) {
                lastFoundIdRef.current = foundId;

                // Clear pending timeouts
                if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

                if (found) {
                    // Skip hover animation for already selected dots
                    const isFoundActive = activeVideoIds.has(found.video.id);
                    if (!isFoundActive) {
                        setInternalFocusedId(foundId);
                        setLastFocusedId(foundId);
                    }

                    // Notify parent after delay (for tooltip)
                    showTimeoutRef.current = setTimeout(() => {
                        const screenX = found.xNorm * worldWidth * transform.scale + transform.offsetX + rect.left;
                        const dotCenterY = found.yNorm * worldHeight * transform.scale + transform.offsetY + rect.top;

                        const percentileGroup = getPercentileGroup(found.video.id);
                        const style = getDotStyle(percentileGroup);
                        const visualRadius = getVisualRadius(style.size, MIN_INTERACTION_SIZE_PX, dotScaleFactor, currentScale);

                        // Calculate dot bounds for tooltip positioning
                        const dotDiameter = visualRadius * 2 * HOVER_SCALE_FACTOR;

                        onHoverVideo({
                            video: found.video,
                            x: screenX,
                            y: dotCenterY - (dotDiameter / 2),
                            width: dotDiameter,
                            height: dotDiameter
                        });
                    }, TOOLTIP_SHOW_DELAY_MS);

                } else {
                    setInternalFocusedId(null);

                    // Delay clearing tooltip to prevent flicker
                    hoverTimeoutRef.current = setTimeout(() => {
                        onHoverVideo(null);
                    }, HOVER_DEBOUNCE_MS);
                }
            }
        }

        // --- CLICK ---
        else if (type === 'click') {
            e.stopPropagation(); // Prevent pan logic

            if (found) {
                onClickVideo(found.video, e);
            } else {
                onClickEmpty?.();
            }
        }

        // --- DOUBLE-CLICK ---
        else if (type === 'dblclick') {
            // Figma-style: only zoom on Cmd/Ctrl + Double-Click
            const isModifier = e.metaKey || e.ctrlKey;

            if (found && isModifier) {
                e.stopPropagation();
                const worldX = found.xNorm * worldWidth;
                const worldY = found.yNorm * worldHeight;
                onDoubleClickVideo(found.video, worldX, worldY, e);
            }
            // Without modifier, event propagates to container for "fit in" behavior
        }
    };

    /**
     * Handle mouse leave: clear hover state with delay.
     */
    const handleMouseLeave = () => {
        lastFoundIdRef.current = null;
        setInternalFocusedId(null);

        if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);

        setTimeout(() => onHoverVideo(null), MOUSE_LEAVE_DELAY_MS);
    };

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 w-full h-full z-10"
            onMouseMove={(e) => handleInteraction(e, 'hover')}
            onClick={(e) => handleInteraction(e, 'click')}
            onDoubleClick={(e) => handleInteraction(e, 'dblclick')}
            onMouseLeave={handleMouseLeave}
        >
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
};
