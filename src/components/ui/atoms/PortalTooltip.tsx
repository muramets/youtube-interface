import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { debug } from '../../../core/utils/debug';

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

/**
 * Fixed preferred dimensions for tooltip.
 * The tooltip will always try to use these dimensions, adapting only when
 * constrained by viewport edges or available space.
 */
const TOOLTIP_PREFERRED_WIDTH = 800;
const TOOLTIP_PREFERRED_HEIGHT = 700;

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
    /** Estimated height for initial positioning (deprecated, now uses fixed dimensions) */
    estimatedHeight?: number;
    /** Override width instead of using preferred width */
    fixedWidth?: number;
    /** Completely disable the tooltip */
    disabled?: boolean;
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
    className = '',
    triggerClassName = '',
    enterDelay = 0,
    forceOpen,
    noAnimation = false,
    title,
    estimatedHeight = 80,
    fixedWidth,
    disabled
}) => {
    // =========================================================================
    // STATE
    // =========================================================================

    // Visual state: controls opacity/transform animations
    const [isVisible, setIsVisible] = useState(false);
    // Mount state: controls whether tooltip is in DOM
    const [shouldRender, setShouldRender] = useState(false);
    // Calculated dimensions from positioning logic
    const [calculatedWidth, setCalculatedWidth] = useState<number | undefined>(undefined);
    const [transform, setTransform] = useState('none');
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
     * Algorithm:
     * 1. Determine anchor center point
     * 2. Calculate actual width (preferred, constrained by viewport)
     * 3. Center horizontally on anchor, clamp to viewport edges
     * 4. Choose vertical side (prefer `side` prop, flip if not enough space)
     * 5. Calculate actual height based on available space
     * 6. Set final position and transform
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

            // --- Horizontal Positioning ---
            const anchorCenterX = rect.left + rect.width / 2;
            const anchorBottom = rect.bottom ?? rect.top + rect.height;
            const anchorTop = rect.top;

            // Use preferred width, but constrain to viewport if necessary
            const actualWidth = Math.min(
                TOOLTIP_PREFERRED_WIDTH,
                viewportWidth - VIEWPORT_EDGE_PADDING * 2
            );

            // Center on anchor, then clamp to viewport edges
            let left = anchorCenterX - actualWidth / 2;
            left = Math.max(
                VIEWPORT_EDGE_PADDING,
                Math.min(left, viewportWidth - actualWidth - VIEWPORT_EDGE_PADDING)
            );

            // --- Vertical Positioning ---
            const spaceBelow = viewportHeight - anchorBottom - VIEWPORT_EDGE_PADDING;
            const spaceAbove = anchorTop - VIEWPORT_EDGE_PADDING;

            // Determine effective side: flip if preferred side doesn't have enough space
            let effectiveSide = preferredSide;
            if (preferredSide === 'bottom' && spaceBelow < TOOLTIP_PREFERRED_HEIGHT && spaceAbove > spaceBelow) {
                effectiveSide = 'top';
            } else if (preferredSide === 'top' && spaceAbove < TOOLTIP_PREFERRED_HEIGHT && spaceBelow > spaceAbove) {
                effectiveSide = 'bottom';
            }

            // Calculate actual height based on available space on chosen side
            const maxAvailableHeight = effectiveSide === 'bottom' ? spaceBelow : spaceAbove;
            const actualHeight = Math.min(TOOLTIP_PREFERRED_HEIGHT, maxAvailableHeight);

            // Calculate top position and transform based on side
            let top: number;
            let finalTransform: string;

            if (effectiveSide === 'bottom') {
                top = anchorBottom + ANCHOR_GAP;
                finalTransform = 'none';
            } else {
                top = anchorTop - ANCHOR_GAP;
                finalTransform = 'translateY(-100%)';
            }

            // --- Debug Logging ---
            debug.tooltipGroup.start('🔍 PortalTooltip Positioning');
            debug.tooltipGroup.log('📐 Viewport:', { viewportWidth, viewportHeight });
            debug.tooltipGroup.log('📍 Anchor:', { centerX: anchorCenterX, top: anchorTop, bottom: anchorBottom });
            debug.tooltipGroup.log('📏 Dimensions:', {
                preferred: { width: TOOLTIP_PREFERRED_WIDTH, height: TOOLTIP_PREFERRED_HEIGHT },
                actual: { width: actualWidth, height: actualHeight }
            });
            debug.tooltipGroup.log('📊 Available Space:', { above: spaceAbove, below: spaceBelow });
            debug.tooltipGroup.log('🔄 Side:', preferredSide, '→', effectiveSide);
            debug.tooltipGroup.log('✅ Final Position:', { top, left, transform: finalTransform });
            debug.tooltipGroup.end();

            // --- Apply State ---
            setPosition({ top, left, maxHeight: actualHeight });
            setCalculatedWidth(actualWidth);
            setTransform(finalTransform);

            positionRafRef.current = null;
        });
    }, []);

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
            transform
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
                        width: fixedWidth ?? calculatedWidth,
                        height: position.maxHeight,
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
                            w-full h-full
                            text-white text-[11px] leading-relaxed
                            transition-all ease-out
                            ${variant === 'glass'
                                ? 'bg-[#1a1a1a]/90 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10'
                                : 'bg-[#1F1F1F] rounded-lg shadow-xl'
                            }
                            ${noAnimation ? 'duration-0' : 'duration-200'}
                            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                            ${className}
                        `}
                        style={{ transformOrigin: 'top center' }}
                    >
                        {/* Scroll Container: handles overflow with consistent padding */}
                        <div
                            className="w-full h-full overflow-y-auto overflow-x-hidden p-4"
                            style={{ scrollbarGutter: 'stable' }}
                            // Isolate scroll events from parent containers (e.g., timeline)
                            onWheel={(e) => e.stopPropagation()}
                        >
                            {content}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
