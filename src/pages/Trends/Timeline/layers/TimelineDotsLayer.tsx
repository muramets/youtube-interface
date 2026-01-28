import React, { useRef, useLayoutEffect, useEffect, useState, useCallback } from 'react';
import type { TrendVideo, VideoPosition } from '../../../../core/types/trends';
import { getDotStyle } from '../../../../core/utils/trendStyles';
import {
    ANIMATION_DURATION_MS,
    DOT_HIT_BUFFER_PX,
    HOVER_DEBOUNCE_MS,
    MIN_INTERACTION_SIZE_PX,
    TOOLTIP_SHOW_DELAY_MS
} from '../utils/timelineConstants';

interface TimelineDotsLayerProps {
    videoPositions: VideoPosition[];
    transform: { scale: number; offsetX: number; offsetY: number };
    worldWidth: number;
    worldHeight: number;
    activeVideoIds: Set<string>;
    getPercentileGroup: (videoId: string) => string | undefined;
    onHoverVideo: (data: { video: TrendVideo; x: number; y: number; width: number; height: number } | null) => void;
    onClickVideo: (video: TrendVideo, e: React.MouseEvent) => void;
    onDoubleClickVideo: (video: TrendVideo, worldX: number, worldY: number, e: React.MouseEvent) => void;
    onClickEmpty?: () => void;
    /** Used to reduce hit buffer when dots are densely packed (0 = no spread, 1 = full spread) */
    verticalSpread?: number;
}

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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dpr, setDpr] = useState(1);

    // Internal Interactions
    const [internalFocusedId, setInternalFocusedId] = useState<string | null>(null);
    const [lastFocusedId, setLastFocusedId] = useState<string | null>(null);  // For fade-out animation

    // Selection Animation State - track which dots are animating their selection state

    const [selectionAnimProgress, setSelectionAnimProgress] = useState<Map<string, number>>(new Map());
    const selectionAnimRef = useRef<{ id: number }>({ id: 0 });

    // Animation State - target is 1 when focused, 0 when not
    const animRef = useRef<{ id: number }>({ id: 0 });
    const [animProgress, setAnimProgress] = useState(0); // 0 to 1
    const animTargetRef = useRef(0);  // Target value we're animating towards
    const animStartRef = useRef(0);   // Starting value when animation begins
    const animStartTimeRef = useRef(0);

    // Timeouts
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFoundIdRef = useRef<string | null>(null);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
        };
    }, []);

    // Initialize DPR
    useEffect(() => {
        setDpr(window.devicePixelRatio || 1);
    }, []);

    // Easing function for smooth animation
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    // ANIMATION LOOP - Premium bidirectional animation
    // Note: lastFocusedId is now managed in handlers to avoid effect cascade
    useEffect(() => {
        if (internalFocusedId) {
            // Animate IN
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
            // Animate OUT
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
                    setLastFocusedId(null);
                }
            };
            animRef.current.id = requestAnimationFrame(animateOut);
        }

        const currentAnimRef = animRef.current;
        return () => cancelAnimationFrame(currentAnimRef.id);
    }, [internalFocusedId, lastFocusedId, animProgress]); // Added animProgress dependency

    // Selection Animation - Derived State Pattern (avoid effect cascade)
    // Check for prop changes during render


    // Selection Animation - Derived State Pattern
    // Check for prop changes during render to avoid effect cascade
    const [prevIds, setPrevIds] = useState<Set<string>>(new Set());
    const currentIds = activeVideoIds;

    let changed = false;
    if (prevIds.size !== currentIds.size) changed = true;
    else {
        for (const id of currentIds) if (!prevIds.has(id)) { changed = true; break; }
    }

    if (changed) {
        // Find newly selected/deselected
        const newlySelected: string[] = [];
        const newlyDeselected: string[] = [];

        currentIds.forEach(id => {
            if (!prevIds.has(id)) newlySelected.push(id);
        });
        prevIds.forEach(id => {
            if (!currentIds.has(id)) newlyDeselected.push(id);
        });

        // Update tracking state immediately to stop loop
        setPrevIds(new Set(currentIds));

        // Update State (triggers immediate re-render with new values)
        setSelectionAnimProgress(prev => {
            const next = new Map(prev);
            newlySelected.forEach(id => {
                const wasHovered = (internalFocusedId === id || lastFocusedId === id);
                next.set(id, prev.get(id) ?? (wasHovered ? animProgress : 0));
            });
            newlyDeselected.forEach(id => next.set(id, prev.get(id) ?? 1));
            return next;
        });

        // Start animation loop
        // eslint-disable-next-line react-hooks/purity
        const startTime = performance.now();
        const animate = (time: number) => {
            // ... Logic simplified for standard easing
            const elapsed = time - startTime;
            const rawProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
            const easedProgress = easeOutCubic(rawProgress);

            setSelectionAnimProgress(prev => {
                const next = new Map(prev);
                newlySelected.forEach(id => {
                    next.set(id, 0 + (1 - 0) * easedProgress);
                });
                newlyDeselected.forEach(id => {
                    next.set(id, 1 * (1 - easedProgress));
                });
                return next;
            });

            if (rawProgress < 1) {
                selectionAnimRef.current.id = requestAnimationFrame(animate);
            } else {
                setSelectionAnimProgress(prev => {
                    const next = new Map(prev);
                    newlyDeselected.forEach(id => next.delete(id));
                    return next;
                });
            }
        };

        cancelAnimationFrame(selectionAnimRef.current.id);
        selectionAnimRef.current.id = requestAnimationFrame(animate);
    }


    const getVisibleWorldBounds = useCallback(() => {
        if (!containerRef.current) return { start: 0, end: 0 };
        const { width } = containerRef.current.getBoundingClientRect();
        const start = (-transform.offsetX - 500) / transform.scale;
        const end = (width - transform.offsetX + 500) / transform.scale;
        return { start, end };
    }, [transform.offsetX, transform.scale]);

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !containerRef.current) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
            console.warn('[TimelineDotsLayer] Failed to get 2D canvas context');
            return;
        }

        const { width, height } = containerRef.current.getBoundingClientRect();

        const displayWidth = Math.floor(width * dpr);
        const displayHeight = Math.floor(height * dpr);

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const { start, end } = getVisibleWorldBounds();

        const currentScale = transform.scale || 0.001;
        const dotScaleFactor = Math.max(1, 0.20 / currentScale);
        const MIN_INTERACTION_SIZE = 12;

        const getVisualRadius = (baseSize: number) => {
            const effectiveSize = Math.max(baseSize, MIN_INTERACTION_SIZE);
            return (effectiveSize / 2) * dotScaleFactor * currentScale;
        };

        let activeHoverItem: { pos: VideoPosition, x: number, y: number, r: number } | null = null;
        /**
         * RENDERING STRATEGY: Two-pass approach for correct z-ordering
         *
         * Pass 1: Draw all non-hovered dots as background layer
         * Pass 2: Draw hovered dot on top with glow effect
         *
         * This ensures the hovered element always renders above others
         * without managing z-index in canvas context.
         */
        // Pass 1: Draw Non-Hovered
        for (const pos of videoPositions) {
            const worldX = pos.xNorm * worldWidth;
            if (worldX < start || worldX > end) continue;

            const worldY = pos.yNorm * worldHeight;
            const screenX = worldX * transform.scale + transform.offsetX;
            const screenY = worldY * transform.scale + transform.offsetY;

            const percentileGroup = getPercentileGroup(pos.video.id);
            const style = getDotStyle(percentileGroup);
            const visualRadius = getVisualRadius(style.size);

            // Capture item for HOVER animation (non-selected dots only)
            // Selected dots should NOT be affected by hover - skip them
            const isActive = activeVideoIds.has(pos.video.id);
            const animatingId = internalFocusedId || lastFocusedId;
            if (!isActive && pos.video.id === animatingId && animProgress > 0) {
                activeHoverItem = { pos, x: screenX, y: screenY, r: visualRadius };
                continue;
            }

            // Active dots get the full hover treatment (glow + scale + ring) - with animation
            if (isActive || selectionAnimProgress.has(pos.video.id)) {
                // Get animation progress (1 = fully selected, 0 = not selected)
                const selectProgress = selectionAnimProgress.get(pos.video.id) ?? (isActive ? 1 : 0);
                if (selectProgress <= 0) continue; // Skip if fully deselected

                // Animate Scale: 1.0 -> 1.25 based on selection progress
                const activeScale = 1.0 + (0.25 * selectProgress);
                const activeRadius = visualRadius * activeScale;

                // Soft Outer Glow (same as hover glow)
                const computedStyle = getComputedStyle(document.documentElement);
                const glowRgb = computedStyle.getPropertyValue('--dot-glow-rgb').trim() || '255, 255, 255';
                const glowRadius = activeRadius * 3.5;
                const gradient = ctx.createRadialGradient(
                    screenX, screenY, activeRadius * 0.5,
                    screenX, screenY, glowRadius
                );
                const glowAlpha = 0.3 * selectProgress;
                gradient.addColorStop(0, `rgba(${glowRgb}, ${glowAlpha})`);
                gradient.addColorStop(0.15, `rgba(${glowRgb}, ${glowAlpha * 0.7})`);
                gradient.addColorStop(0.3, `rgba(${glowRgb}, ${glowAlpha * 0.45})`);
                gradient.addColorStop(0.5, `rgba(${glowRgb}, ${glowAlpha * 0.2})`);
                gradient.addColorStop(0.7, `rgba(${glowRgb}, ${glowAlpha * 0.08})`);
                gradient.addColorStop(0.85, `rgba(${glowRgb}, ${glowAlpha * 0.02})`);
                gradient.addColorStop(1, `rgba(${glowRgb}, 0)`);
                ctx.beginPath();
                ctx.arc(screenX, screenY, glowRadius, 0, 2 * Math.PI);
                ctx.fillStyle = gradient;
                ctx.fill();

                // Active Ring (Selection) - on top of glow, with animated opacity
                ctx.beginPath();
                ctx.arc(screenX, screenY, activeRadius * 1.1, 0, 2 * Math.PI);
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * selectProgress})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Main Dot (scaled + brightened)
                ctx.beginPath();
                ctx.arc(screenX, screenY, activeRadius, 0, 2 * Math.PI);
                ctx.fillStyle = style.colorHex;
                const brightness = 1 + (0.2 * selectProgress);
                ctx.filter = `brightness(${brightness})`;
                ctx.fill();
                ctx.filter = 'none';
                continue; // Skip normal rendering
            }

            // Main Dot (non-active)
            ctx.beginPath();
            ctx.arc(screenX, screenY, visualRadius, 0, 2 * Math.PI);
            ctx.fillStyle = style.colorHex;
            ctx.fill();
        }

        // Pass 2: Draw Hovered (Animated) - Match VideoNode hover style (no ring, soft glow)
        if (activeHoverItem) {
            const { pos, x: screenX, y: screenY, r: visualRadius } = activeHoverItem;
            const percentileGroup = getPercentileGroup(pos.video.id);
            const style = getDotStyle(percentileGroup);

            // Animate Scale: 1.0 -> 1.25 based on animProgress (matching VideoNode's scale(1.25))
            const scale = 1.0 + (0.25 * animProgress);
            const animatedRadius = visualRadius * scale;

            // Soft Outer Glow using radial gradient (matching VideoNode's drop-shadow)
            if (animProgress > 0) {
                // Get glow color from CSS variable (supports theme switching)
                const computedStyle = getComputedStyle(document.documentElement);
                const glowRgb = computedStyle.getPropertyValue('--dot-glow-rgb').trim() || '255, 255, 255';

                const glowRadius = animatedRadius * 3.5;
                const gradient = ctx.createRadialGradient(
                    screenX, screenY, animatedRadius * 0.5,  // Inner circle (start fade from center of dot)
                    screenX, screenY, glowRadius              // Outer circle (fade out completely)
                );

                const glowAlpha = 0.3 * animProgress;
                // More color stops for ultra-smooth gradient transition
                gradient.addColorStop(0, `rgba(${glowRgb}, ${glowAlpha})`);
                gradient.addColorStop(0.15, `rgba(${glowRgb}, ${glowAlpha * 0.7})`);
                gradient.addColorStop(0.3, `rgba(${glowRgb}, ${glowAlpha * 0.45})`);
                gradient.addColorStop(0.5, `rgba(${glowRgb}, ${glowAlpha * 0.2})`);
                gradient.addColorStop(0.7, `rgba(${glowRgb}, ${glowAlpha * 0.08})`);
                gradient.addColorStop(0.85, `rgba(${glowRgb}, ${glowAlpha * 0.02})`);
                gradient.addColorStop(1, `rgba(${glowRgb}, 0)`);

                ctx.beginPath();
                ctx.arc(screenX, screenY, glowRadius, 0, 2 * Math.PI);
                ctx.fillStyle = gradient;
                ctx.fill();
            }

            // Main Dot (Color)
            ctx.beginPath();
            ctx.arc(screenX, screenY, animatedRadius, 0, 2 * Math.PI);
            ctx.fillStyle = style.colorHex;
            ctx.fill();
        }

    }, [videoPositions, transform, worldWidth, worldHeight, activeVideoIds, internalFocusedId, lastFocusedId, dpr, animProgress, selectionAnimProgress, getPercentileGroup, getVisibleWorldBounds]);


    const handleInteraction = (e: React.MouseEvent, type: 'hover' | 'click' | 'dblclick') => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        let found: VideoPosition | null = null;
        const { start, end } = getVisibleWorldBounds();
        const currentScale = transform.scale || 0.001;
        const dotScaleFactor = Math.max(1, 0.20 / currentScale);


        const getVisualRadius = (baseSize: number) => {
            const effectiveSize = Math.max(baseSize, MIN_INTERACTION_SIZE_PX);
            return (effectiveSize / 2) * dotScaleFactor * currentScale;
        };


        /**
         * HIT DETECTION STRATEGY:
         * When verticalSpread is low, dots overlap. We collect ALL dots under cursor
         * and pick the one with the LARGEST baseSize (highest z-order / most views).
         * This matches rendering order where larger dots are drawn last (on top).
         * 
         * BUFFER SCALING: Reduce hit buffer when dots are compressed to allow
         * precise hovering on small dots between large ones.
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
            const visualRadius = getVisualRadius(style.size);

            const dx = x - screenX;
            const dy = y - screenY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= visualRadius + scaledHitBuffer) {
                candidates.push({ pos, dist });
            }
        }

        // Pick the candidate with largest baseSize (z-order priority)
        // If tied on size, pick the closest to cursor
        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                const sizeDiff = b.pos.baseSize - a.pos.baseSize;
                if (sizeDiff !== 0) return sizeDiff; // Larger first
                return a.dist - b.dist; // Closer first if same size
            });
            found = candidates[0].pos;
        }

        if (type === 'hover') {
            const foundId = found?.video.id || null;

            if (foundId !== lastFoundIdRef.current) {
                lastFoundIdRef.current = foundId;

                if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

                if (found) {
                    // Don't trigger hover animation for selected dots
                    const isFoundActive = activeVideoIds.has(found.video.id);
                    if (!isFoundActive) {
                        setInternalFocusedId(foundId);
                        setLastFocusedId(foundId); // Sync immediately
                    }
                    if (containerRef.current) containerRef.current.style.cursor = 'pointer';

                    showTimeoutRef.current = setTimeout(() => {
                        const screenX = found.xNorm * worldWidth * transform.scale + transform.offsetX + rect.left;
                        const dotCenterY = found.yNorm * worldHeight * transform.scale + transform.offsetY + rect.top;

                        const percentileGroup = getPercentileGroup(found.video.id);
                        const style = getDotStyle(percentileGroup);
                        const visualRadius = getVisualRadius(style.size);

                        // Dot diameter for positioning (with hover scale 1.25 applied)
                        const hoverScale = 1.25;
                        const dotDiameter = visualRadius * 2 * hoverScale;

                        // Position tooltip BELOW the dot (y = top of dot, height = dot diameter)
                        // TrendTooltip will use smart positioning logic to decide final placement
                        onHoverVideo({
                            video: found.video,
                            x: screenX,
                            y: dotCenterY - (dotDiameter / 2),  // Top of the dot
                            width: dotDiameter,
                            height: dotDiameter
                        });
                    }, TOOLTIP_SHOW_DELAY_MS);

                } else {
                    setInternalFocusedId(null);
                    // Do NOT unlock lastFocusedId here - wait for animation to clear it
                    if (containerRef.current) containerRef.current.style.cursor = ''; // Reset to inherit from parent

                    hoverTimeoutRef.current = setTimeout(() => {
                        onHoverVideo(null);
                    }, HOVER_DEBOUNCE_MS);
                }
            }
        } else if (type === 'click') {
            e.stopPropagation(); // ALWAYS stop propagation to prevent pan logic

            if (found) {
                // Instant selection (Figma-style) - no delay
                onClickVideo(found.video, e);
            } else {
                // Click on empty space - clear selection immediately
                onClickEmpty?.();
            }
        } else if (type === 'dblclick') {
            // Only zoom on Cmd/Ctrl + Double-Click (Figma-style)
            const isModifier = e.metaKey || e.ctrlKey;

            if (found && isModifier) {
                e.stopPropagation(); // Only stop propagation if we hit a dot with modifier
                const worldX = found.xNorm * worldWidth;
                const worldY = found.yNorm * worldHeight;
                onDoubleClickVideo(found.video, worldX, worldY, e);
            }
            // If no modifier or no dot found, let the event propagate to container for "fit in" behavior
        }
    };

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 w-full h-full z-10"
            onMouseMove={(e) => handleInteraction(e, 'hover')}
            onClick={(e) => handleInteraction(e, 'click')}
            onDoubleClick={(e) => handleInteraction(e, 'dblclick')}
            onMouseLeave={() => {
                lastFoundIdRef.current = null;
                setInternalFocusedId(null);
                if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
                setTimeout(() => onHoverVideo(null), 200);
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
};
