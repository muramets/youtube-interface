import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { debug } from '../../../core/utils/debug';

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

/**
 * Fixed dimensions for 'fixed' sizeMode (used for large video preview tooltips).
 * Only applies when sizeMode='fixed' is explicitly set.
 */
const FIXED_TOOLTIP_WIDTH = 800;
const FIXED_TOOLTIP_HEIGHT = 700;

/**
 * Maximum width for 'auto' sizeMode (default behavior).
 * Tooltip will grow to fit content up to this limit.
 */
const AUTO_MAX_WIDTH = 360;

/**
 * Minimum distance from viewport edges.
 * Ensures tooltip never touches or overflows screen boundaries.
 */
const VIEWPORT_EDGE_PADDING = 16;

/**
 * Gap between anchor element and tooltip.
 * Creates visual separation without feeling disconnected.
 */
const ANCHOR_GAP = 4;

/**
 * Delay before hiding tooltip after mouse leaves (ms).
 * Allows user to move cursor from trigger to tooltip without interruption.
 */
const HIDE_DELAY_MS = 300;

/**
 * Animation duration for fade in/out transitions (ms).
 * Matches the CSS transition duration for proper cleanup timing.
 */
const ANIMATION_DURATION_MS = 200;

// =============================================================================
// TYPES
// =============================================================================

interface PortalTooltipProps {
    /** Content to display inside the tooltip */
    content: React.ReactNode;
    /** Trigger element (optional if using anchorRect for programmatic positioning) */
    children?: React.ReactElement;
    /** Manual anchor position for programmatic tooltips (e.g., video cards on timeline) */
    anchorRect?: {
        top: number;
        left: number;
        width: number;
        height: number;
        right?: number;
        bottom?: number;
    };
    /** Horizontal alignment relative to anchor (used for simple tooltips) */
    align?: 'left' | 'center' | 'right';
    /** Preferred vertical side (will flip if not enough space) */
    side?: 'bottom' | 'left' | 'right' | 'top';
    /** Callback when tooltip visibility changes */
    onOpenChange?: (isOpen: boolean) => void;
    /** Visual variant: 'default' for simple tooltips, 'glass' for premium video previews */
    variant?: 'default' | 'glass';
    /**
     * Size mode for the tooltip:
     * - 'auto' (default): Fits content with sensible max-width (360px)
     * - 'fixed': Large fixed size (800x700) for rich content like video previews
     */
    sizeMode?: 'auto' | 'fixed';
    /** Additional CSS classes for the tooltip frame */
    className?: string;
    /** Additional CSS classes for the trigger wrapper */
    triggerClassName?: string;
    /** Delay before showing tooltip on hover (ms) */
    enterDelay?: number;
    /** External control: true = force show, false = force hide, undefined = use hover */
    forceOpen?: boolean;
    /** Disable enter/exit animations */
    noAnimation?: boolean;
    /** Native title attribute for trigger element */
    title?: string;
    /** @deprecated Use sizeMode instead */
    estimatedHeight?: number;
    /** @deprecated Use sizeMode='fixed' instead */
    fixedWidth?: number;
    /** Completely disable the tooltip */
    disabled?: boolean;
    /** Override the default max-width for auto sizeMode (default: 360px) */
    maxWidth?: number;
}

interface TooltipPosition {
    top: number;
    left: number;
    maxHeight?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * PortalTooltip - A flexible tooltip component rendered via React Portal.
 *
 * ## Key Features:
 * - **Fixed Preferred Size**: Always attempts to render at 800x700px for consistent UX
 * - **Smart Positioning**: Centers on anchor, clamps to viewport edges
 * - **Automatic Flip**: Shows above anchor if not enough space below
 * - **Scroll Isolation**: Internal scrolling doesn't affect parent containers
 * - **Dual Control Modes**: Hover-triggered or programmatically controlled via forceOpen
 *
 * ## DOM Structure (for 'glass' variant):
 * ```
 * [Positioning Container] - fixed position, dimensions, pointer-events
 *   └─ [Visual Frame] - background, border-radius, shadow, backdrop-blur
 *       └─ [Scroll Container] - overflow handling, premium padding
 *           └─ [Content]
 * ```
 */
export const PortalTooltip: React.FC<PortalTooltipProps> = ({
    content,
    children,
    anchorRect,
    align = 'left',
    side = 'bottom',
    onOpenChange,
    variant = 'default',
    sizeMode = 'auto',
    className = '',
    triggerClassName = '',
    enterDelay = 0,
    forceOpen,
    noAnimation = false,
    title,
    estimatedHeight = 80,
    fixedWidth,
    disabled,
    maxWidth,
}) => {
    // =========================================================================
    // STATE
    // =========================================================================

    // Visual state: controls opacity/transform animations
    const [isVisible, setIsVisible] = useState(false);
    // Mount state: controls whether vertical flip happens
    const [shouldRender, setShouldRender] = useState(false);
    // Calculated dimensions from positioning logic
    const [calculatedWidth, setCalculatedWidth] = useState<number | undefined>(undefined);
    const [transform, setTransform] = useState('none');
    const [transformOrigin, setTransformOrigin] = useState('top center');
    const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0 });

    // =========================================================================
    // REFS
    // =========================================================================

    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Timeout refs for cleanup
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const positionRafRef = useRef<number | null>(null);

    // Track hover state for re-showing after disabled state changes
    const isHoveredRef = useRef(false);

    // Props ref for stable callbacks (avoids recreating updatePosition)
    const propsRef = useRef({ anchorRect, align, side, estimatedHeight });
    useEffect(() => {
        propsRef.current = { anchorRect, align, side, estimatedHeight };
    }, [anchorRect, align, side, estimatedHeight]);

    // =========================================================================
    // POSITIONING LOGIC
    // =========================================================================

    /**
     * Calculates and updates tooltip position based on anchor and viewport.
     *
     * Algorithm varies by sizeMode:
     * - 'auto': Position relative to anchor with max-width constraint, auto height
     * - 'fixed': Center on anchor with fixed 800x700 dimensions, flip if needed
     */
    const updatePosition = useCallback(() => {
        // Prevent multiple RAF calls from stacking
        if (positionRafRef.current) return;

        positionRafRef.current = requestAnimationFrame(() => {
            const { anchorRect: currentAnchorRect, side: preferredSide } = propsRef.current;
            const rect = currentAnchorRect || triggerRef.current?.getBoundingClientRect();

            if (!rect) {
                positionRafRef.current = null;
                return;
            }

            const viewportWidth = document.documentElement.clientWidth;
            const viewportHeight = document.documentElement.clientHeight;

            const anchorCenterX = rect.left + rect.width / 2;
            const anchorBottom = rect.bottom ?? rect.top + rect.height;
            const anchorTop = rect.top;

            let actualWidth: number | undefined;
            let actualHeight: number | undefined;
            let left: number;
            let top: number;
            let finalTransform: string;

            if (sizeMode === 'fixed') {
                // --- FIXED MODE: Large tooltip for video previews ---
                // Use fixed dimensions, center on anchor, clamp to viewport

                actualWidth = Math.min(
                    FIXED_TOOLTIP_WIDTH,
                    viewportWidth - VIEWPORT_EDGE_PADDING * 2
                );

                // Center on anchor, then clamp to viewport edges
                left = anchorCenterX - actualWidth / 2;
                left = Math.max(
                    VIEWPORT_EDGE_PADDING,
                    Math.min(left, viewportWidth - actualWidth - VIEWPORT_EDGE_PADDING)
                );

                // Vertical: flip if not enough space
                const spaceBelow = viewportHeight - anchorBottom - VIEWPORT_EDGE_PADDING;
                const spaceAbove = anchorTop - VIEWPORT_EDGE_PADDING;

                let effectiveSide = preferredSide;
                if (preferredSide === 'bottom' && spaceBelow < FIXED_TOOLTIP_HEIGHT && spaceAbove > spaceBelow) {
                    effectiveSide = 'top';
                } else if (preferredSide === 'top' && spaceAbove < FIXED_TOOLTIP_HEIGHT && spaceBelow > spaceAbove) {
                    effectiveSide = 'bottom';
                }

                const maxAvailableHeight = effectiveSide === 'bottom' ? spaceBelow : spaceAbove;
                actualHeight = Math.min(FIXED_TOOLTIP_HEIGHT, maxAvailableHeight);

                if (effectiveSide === 'bottom') {
                    top = anchorBottom + ANCHOR_GAP;
                    finalTransform = 'none';
                } else {
                    top = anchorTop - ANCHOR_GAP;
                    finalTransform = 'translateY(-100%)';
                }

            } else {
                // --- AUTO MODE: Content-sized tooltip ---
                // We use CSS transforms to handle alignment without knowing exact width.

                actualWidth = undefined;
                actualHeight = undefined;

                const anchorLeft = rect.left;
                const anchorRight = rect.right ?? rect.left + rect.width;
                const anchorCenter = rect.left + rect.width / 2;
                const anchorMiddleY = rect.top + rect.height / 2;

                let finalTransformX = '0';
                let finalTransformY = '0';

                if (preferredSide === 'right' || preferredSide === 'left') {
                    // --- HORIZONTAL SIDE MODE (right/left of anchor) ---
                    if (preferredSide === 'right') {
                        left = anchorRight + ANCHOR_GAP;
                        finalTransformX = '0';
                    } else {
                        left = anchorLeft - ANCHOR_GAP;
                        finalTransformX = '-100%';
                    }

                    // Vertical: center on anchor
                    top = anchorMiddleY;
                    finalTransformY = '-50%';

                    // Clamp to viewport edges after transform
                    // For side=right, we know the tooltip expands rightward from `left`.
                    // For side=left, the transform shifts it leftward.
                    // We rely on maxWidth + viewport clamping to prevent overflow.

                    const originX = preferredSide === 'right' ? 'left' : 'right';
                    setTransformOrigin(`${originX} center`);

                } else {
                    // --- VERTICAL SIDE MODE (bottom/top of anchor) ---

                    // Determine horizontal alignment based on prop and available space
                    let effectiveAlign = propsRef.current.align;
                    const spaceLeft = anchorRight; // Space available for expanding left (align=right)
                    const spaceRight = viewportWidth - anchorLeft; // Space available for expanding right (align=left)

                    // Heuristic: If preferred side is tight (<200px) and other side has more space, flip.
                    if (effectiveAlign === 'left' && spaceRight < 200 && spaceLeft > spaceRight) {
                        effectiveAlign = 'right';
                    } else if (effectiveAlign === 'right' && spaceLeft < 200 && spaceRight > spaceLeft) {
                        effectiveAlign = 'left';
                    }

                    // Calculate Left position and Horizontal Transform

                    if (effectiveAlign === 'left') {
                        left = anchorLeft;
                        finalTransformX = '0';
                    } else if (effectiveAlign === 'right') {
                        left = anchorRight;
                        finalTransformX = '-100%';
                    } else {
                        // Center
                        left = anchorCenter;
                        finalTransformX = '-50%';
                    }

                    // Vertical positioning
                    if (preferredSide === 'bottom') {
                        top = anchorBottom + ANCHOR_GAP;
                        finalTransformY = '0';
                    } else {
                        top = anchorTop - ANCHOR_GAP;
                        finalTransformY = '-100%';
                    }

                    // Determine Transform Origin for animation
                    const originY = preferredSide === 'bottom' ? 'top' : 'bottom';
                    setTransformOrigin(`${originY} ${effectiveAlign}`);
                }

                finalTransform = `translate(${finalTransformX}, ${finalTransformY})`;
            }

            // --- Debug Logging ---
            debug.tooltipGroup.start('🔍 PortalTooltip Positioning');
            debug.tooltipGroup.log('📐 Mode:', sizeMode);
            debug.tooltipGroup.log('📍 Anchor:', { left: rect.left, right: rect.right, width: rect.width });
            debug.tooltipGroup.log('🎯 Align:', propsRef.current.align, '→', sizeMode === 'auto' ? 'Dynamic' : 'Fixed');
            debug.tooltipGroup.log('✅ Final Position:', { top, left, transform: finalTransform });
            debug.tooltipGroup.end();

            // --- Apply State ---
            setPosition({ top, left, maxHeight: actualHeight });
            setCalculatedWidth(actualWidth);
            setTransform(finalTransform);

            positionRafRef.current = null;
        });
    }, [sizeMode]);


    // =========================================================================
    // SHOW / HIDE LOGIC
    // =========================================================================

    /**
     * Shows the tooltip with proper sequencing:
     * 1. Calculate position
     * 2. Mount to DOM (shouldRender = true)
     * 3. Wait for next frame to trigger CSS transition (isVisible = true)
     */
    const showTooltip = useCallback(() => {
        updatePosition();
        setShouldRender(true);

        // Double RAF ensures DOM is ready before triggering animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsVisible(true);
                onOpenChange?.(true);
            });
        });
    }, [updatePosition, onOpenChange]);

    /**
     * Hides the tooltip with animation:
     * 1. Start fade out (isVisible = false)
     * 2. Wait for animation to complete
     * 3. Unmount from DOM (shouldRender = false)
     */
    const hideTooltip = useCallback(() => {
        setIsVisible(false);
        onOpenChange?.(false);

        const delay = noAnimation ? 0 : ANIMATION_DURATION_MS;

        closeTimeoutRef.current = setTimeout(() => {
            setShouldRender(false);
        }, delay);
    }, [onOpenChange, noAnimation]);

    // =========================================================================
    // EXTERNAL CONTROL (forceOpen / disabled)
    // =========================================================================

    useEffect(() => {
        // Handle disabled state
        if (disabled) {
            const timer = setTimeout(() => hideTooltip(), 0);
            return () => clearTimeout(timer);
        }

        // Re-show if disabled becomes false while still hovered
        if (!disabled && isHoveredRef.current && forceOpen === undefined) {
            const timer = setTimeout(() => showTooltip(), 0);
            return () => clearTimeout(timer);
        }

        // Handle forceOpen prop
        if (forceOpen !== undefined) {
            const timer = setTimeout(() => {
                if (forceOpen) {
                    // Cancel any pending close
                    if (closeTimeoutRef.current) {
                        clearTimeout(closeTimeoutRef.current);
                        closeTimeoutRef.current = null;
                    }
                    showTooltip();
                } else {
                    // Cancel any pending open
                    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
                    hideTooltip();
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [forceOpen, disabled, showTooltip, hideTooltip]);

    // =========================================================================
    // HOVER HANDLERS
    // =========================================================================

    const handleMouseEnter = () => {
        if (disabled) return;
        if (forceOpen !== undefined) return; // Ignore hover when externally controlled

        isHoveredRef.current = true;

        // Clear any pending hide/close timeouts
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        if (enterTimeoutRef.current) {
            clearTimeout(enterTimeoutRef.current);
            enterTimeoutRef.current = null;
        }

        // If already mounted but fading out, restore visibility immediately
        if (shouldRender) {
            if (!isVisible) {
                setIsVisible(true);
                onOpenChange?.(true);
            }
            return;
        }

        // Apply enter delay if configured
        if (enterDelay > 0) {
            enterTimeoutRef.current = setTimeout(showTooltip, enterDelay);
        } else {
            showTooltip();
        }
    };

    const handleMouseLeave = () => {
        if (forceOpen !== undefined) return; // Ignore hover when externally controlled

        isHoveredRef.current = false;

        // Cancel pending enter
        if (enterTimeoutRef.current) {
            clearTimeout(enterTimeoutRef.current);
            enterTimeoutRef.current = null;
        }

        // Delay hide to allow cursor to move to tooltip
        hideTimeoutRef.current = setTimeout(() => {
            hideTooltip();
        }, HIDE_DELAY_MS);
    };

    // =========================================================================
    // POSITION UPDATES ON SCROLL/RESIZE
    // =========================================================================

    useEffect(() => {
        if (!shouldRender) return;

        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);

        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
            if (positionRafRef.current) {
                cancelAnimationFrame(positionRafRef.current);
                positionRafRef.current = null;
            }
        };
    }, [shouldRender, updatePosition]);

    // =========================================================================
    // DEBUG LOGGING
    // =========================================================================

    if (shouldRender) {
        debug.tooltip('🎨 Tooltip Render State:', {
            shouldRender,
            isVisible,
            forceOpen,
            position,
            calculatedWidth,
            transform,
            transformOrigin
        });
    }

    // =========================================================================
    // RENDER
    // =========================================================================

    return (
        <div
            ref={triggerRef}
            onPointerEnter={handleMouseEnter}
            onPointerLeave={handleMouseLeave}
            className={`relative flex items-center justify-center ${triggerClassName}`}
            title={title}
        >
            {children}

            {shouldRender && createPortal(
                /* Positioning Container: handles fixed positioning and dimensions */
                <div
                    className="fixed z-[10000] will-change-transform"
                    style={{
                        top: Math.round(position.top),
                        left: Math.round(position.left),
                        transform,
                        // Fixed mode: explicit dimensions, Auto mode: let content determine size
                        width: sizeMode === 'fixed' ? (fixedWidth ?? calculatedWidth) : undefined,
                        height: sizeMode === 'fixed' ? position.maxHeight : undefined,
                        maxWidth: sizeMode === 'auto' ? (maxWidth ?? AUTO_MAX_WIDTH) : undefined,
                        // Prevent tooltip from intercepting events during initial positioning
                        pointerEvents: isVisible ? 'auto' : 'none',
                    }}
                    onPointerEnter={handleMouseEnter}
                    onPointerLeave={() => {
                        if (forceOpen === undefined) handleMouseLeave();
                    }}
                >
                    {/* Visual Frame: handles appearance (background, border, shadow) */}
                    <div
                        ref={tooltipRef}
                        className={`
                            text-white text-[11px] leading-relaxed
                            transition-all ease-out
                            ${sizeMode === 'fixed' ? 'w-full h-full' : ''}
                            ${variant === 'glass'
                                ? 'bg-[#1a1a1a]/90 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10'
                                : 'bg-[#1F1F1F] rounded-lg shadow-xl'
                            }
                            ${noAnimation ? 'duration-0' : 'duration-200'}
                            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                            ${className}
                        `}
                        style={{ transformOrigin }}
                    >
                        {sizeMode === 'fixed' ? (
                            /* Fixed mode: Scroll Container for overflow handling */
                            <div
                                className="w-full h-full overflow-y-auto overflow-x-hidden p-4"
                                style={{ scrollbarGutter: 'stable' }}
                                onWheel={(e) => e.stopPropagation()}
                            >
                                {content}
                            </div>
                        ) : (
                            /* Auto mode: Simple padding, content determines size */
                            <div className="px-3 py-2 whitespace-pre-wrap break-words">
                                {content}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
