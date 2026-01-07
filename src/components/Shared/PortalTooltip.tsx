import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface PortalTooltipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    align?: 'left' | 'center' | 'right';
    side?: 'bottom' | 'left' | 'right' | 'top';
    onOpenChange?: (isOpen: boolean) => void;
    className?: string;
    triggerClassName?: string;
    enterDelay?: number;
    forceOpen?: boolean;
    noAnimation?: boolean;
}

export const PortalTooltip: React.FC<PortalTooltipProps> = ({
    content,
    children,
    align = 'left',
    side = 'bottom',
    onOpenChange,
    className = '',
    triggerClassName = '',
    enterDelay = 0,
    forceOpen,
    noAnimation = false
}) => {
    const [isVisible, setIsVisible] = useState(false); // Controls visual opacity/transform
    const [shouldRender, setShouldRender] = useState(false); // Controls mounting
    const [maxWidth, setMaxWidth] = useState<number | undefined>(undefined);
    const [finalTransform, setFinalTransform] = useState('none');

    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isHoveredRef = useRef(false);

    const positionRaf = useRef<number | null>(null);

    const updatePosition = useCallback(() => {
        if (positionRaf.current) return;

        positionRaf.current = requestAnimationFrame(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                const viewportWidth = document.documentElement.clientWidth;
                const padding = 16;
                const minWidth = 200; // Minimum width we try to maintain before forcefully shrinking

                let top = 0;
                let left = 0;
                let calculatedMaxWidth: number | undefined = undefined;
                let transform = 'none';

                // --- HORIZONTAL POSITIONING LOGIC ---
                // We primarily determine horizontal placement (left/right) relative to viewport
                // regardless of whether the tooltip is top/bottom or side-aligned.

                // Calculate available space on both sides
                // For 'align=left', tooltip grows right: space is (viewport - rect.left)
                // For 'align=right', tooltip grows left: space is (rect.right)

                // Effective alignment determination (handling flipping)
                let effectiveAlign = align;

                if (side === 'left' || side === 'right') {
                    // For side tooltips, main axis is horizontal. We flip sides, not align.
                    // This is handled separately below.
                } else {
                    // Top/Bottom tooltips: check if we need to flip alignment
                    const spaceRight = viewportWidth - rect.left - padding;
                    const spaceLeft = rect.right - padding;

                    if (align === 'left' && spaceRight < minWidth && spaceLeft > spaceRight) {
                        effectiveAlign = 'right';
                    } else if (align === 'right' && spaceLeft < minWidth && spaceRight > spaceLeft) {
                        effectiveAlign = 'left';
                    }
                }

                // --- POSITION CALCULATION ---

                if (side === 'top' || side === 'bottom') {
                    // Vertical Position
                    top = side === 'bottom' ? rect.bottom + 8 : rect.top - 8;

                    // Horizontal Position based on Effective Alignment
                    if (effectiveAlign === 'left') {
                        left = rect.left;
                        transform = side === 'top' ? 'translateY(-100%)' : 'none';
                        // Max width is distance to right edge
                        calculatedMaxWidth = viewportWidth - left - padding;
                    } else if (effectiveAlign === 'right') {
                        left = rect.right;
                        transform = `translateX(-100%) ${side === 'top' ? 'translateY(-100%)' : ''}`;
                        // Max width is distance to left edge (which is 'left' value minus padding)
                        calculatedMaxWidth = left - padding;
                    } else { // center
                        left = rect.left + (rect.width / 2);
                        transform = `translateX(-50%) ${side === 'top' ? 'translateY(-100%)' : ''}`;
                        calculatedMaxWidth = Math.min(left - padding, viewportWidth - left - padding) * 2;
                    }

                } else {
                    // Side Position (Left/Right)
                    // Determine if we need to flip side based on available width
                    let effectiveSide = side;
                    const spaceRight = viewportWidth - rect.right - 8 - padding;
                    const spaceLeft = rect.left - 8 - padding;

                    if (side === 'right' && spaceRight < minWidth && spaceLeft > spaceRight) {
                        effectiveSide = 'left';
                    } else if (side === 'left' && spaceLeft < minWidth && spaceRight > spaceLeft) {
                        effectiveSide = 'right';
                    }

                    top = rect.top; // Default top alignment

                    if (effectiveSide === 'left') {
                        left = rect.left - 8;
                        transform = 'translateX(-100%)';
                        calculatedMaxWidth = left - padding;
                    } else {
                        left = rect.right + 8;
                        transform = 'none';
                        calculatedMaxWidth = viewportWidth - left - padding;
                    }
                }

                setPosition({ top, left });
                setMaxWidth(calculatedMaxWidth);
                setFinalTransform(transform);
            }
            positionRaf.current = null;
        });
    }, [align, side]);

    const showTooltip = useCallback(() => {
        updatePosition();
        setShouldRender(true);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsVisible(true);
                onOpenChange?.(true);
            });
        });
    }, [updatePosition, onOpenChange]);

    const hideTooltip = useCallback(() => {
        setIsVisible(false);
        onOpenChange?.(false);

        const delay = noAnimation ? 0 : 200;

        closeTimeoutRef.current = setTimeout(() => {
            // Only unmount if not visible (handled by isVisible check in effect usually, but here relies on timeout)
            // We can just unmount.
            setShouldRender(false);
        }, delay);
    }, [onOpenChange, noAnimation]);

    // Handle External Control
    useEffect(() => {
        if (forceOpen !== undefined) {
            if (forceOpen) {
                // Clear closing timeouts
                if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                    closeTimeoutRef.current = null;
                }
                showTooltip();
            } else {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
                hideTooltip();
            }
        }
    }, [forceOpen, showTooltip, hideTooltip]);


    const handleMouseEnter = () => {
        if (forceOpen !== undefined) return; // Ignore internal hover if forced
        isHoveredRef.current = true;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        if (enterTimeoutRef.current) {
            clearTimeout(enterTimeoutRef.current);
            enterTimeoutRef.current = null;
        }

        if (enterDelay > 0) {
            enterTimeoutRef.current = setTimeout(showTooltip, enterDelay);
        } else {
            showTooltip();
        }
    };

    const handleMouseLeave = () => {
        if (forceOpen !== undefined) return; // Ignore internal hover if forced
        isHoveredRef.current = false;

        if (enterTimeoutRef.current) {
            clearTimeout(enterTimeoutRef.current);
            enterTimeoutRef.current = null;
        }

        timeoutRef.current = setTimeout(() => {
            hideTooltip();
        }, 300); // Delay to allow moving to tooltip
    };

    // Update position on scroll or resize while visible
    useEffect(() => {
        if (shouldRender) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
                if (positionRaf.current) {
                    cancelAnimationFrame(positionRaf.current);
                    positionRaf.current = null;
                }
            };
        }
    }, [shouldRender, updatePosition]);



    return (
        <div
            ref={triggerRef}
            onPointerEnter={handleMouseEnter}
            onPointerLeave={handleMouseLeave}
            className={`relative inline-flex items-center justify-center ${triggerClassName}`}
        >
            {children}
            {shouldRender && createPortal(
                <div
                    className={`fixed z-[10000] pointer-events-auto will-change-transform`}
                    style={{
                        top: Math.round(position.top),
                        left: Math.round(position.left),
                        transform: finalTransform,
                        maxWidth: maxWidth ? Math.round(maxWidth) : undefined,
                    }}
                    onPointerEnter={handleMouseEnter} // Keep open when hovering tooltip
                    onPointerLeave={handleMouseLeave}
                >
                    <div
                        ref={tooltipRef}
                        className={`
                            bg-[#1F1F1F] text-white text-[11px] leading-relaxed px-3 py-2 rounded-lg
                            whitespace-normal break-all max-w-full shadow-xl text-left border border-white/10
                            transition-all ease-out origin-top-right
                            ${noAnimation ? 'duration-0' : 'duration-200'}
                            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                            ${className}
                        `}
                    >
                        {content}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
