import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface PortalTooltipProps {
    content: React.ReactNode;
    children?: React.ReactElement; // Make optional if using anchorRect
    anchorRect?: { top: number; left: number; width: number; height: number; right?: number; bottom?: number };
    align?: 'left' | 'center' | 'right';
    side?: 'bottom' | 'left' | 'right' | 'top';
    onOpenChange?: (isOpen: boolean) => void;
    variant?: 'default' | 'glass';
    className?: string;
    triggerClassName?: string;
    enterDelay?: number;
    forceOpen?: boolean;
    noAnimation?: boolean;
    title?: string;
    estimatedHeight?: number;
    fixedWidth?: number;
    disabled?: boolean;
}

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

    // Refs to hold latest prop values for stable callbacks
    const propsRef = useRef({ anchorRect, align, side, estimatedHeight });
    useEffect(() => {
        propsRef.current = { anchorRect, align, side, estimatedHeight };
    }, [anchorRect, align, side, estimatedHeight]);

    const positionRaf = useRef<number | null>(null);

    const updatePosition = useCallback(() => {
        if (positionRaf.current) return;

        positionRaf.current = requestAnimationFrame(() => {
            const { anchorRect: currentAnchorRect, align: currentAlign, side: currentSide, estimatedHeight: currentEstimatedHeight } = propsRef.current;
            const rect = currentAnchorRect || (triggerRef.current?.getBoundingClientRect());
            if (rect) {
                const viewportWidth = document.documentElement.clientWidth;
                const viewportHeight = document.documentElement.clientHeight;
                const padding = 32; // Increased buffer to trigger flip earlier
                const minWidth = 200;

                let top = 0;
                let left = 0;
                let calculatedMaxWidth: number | undefined = undefined;
                let transform = 'none';

                let effectiveAlign = currentAlign;
                let effectiveSide = currentSide;

                // Dynamic Height Measurement: Use actual height if rendered, else estimate
                const currentHeight = tooltipRef.current?.offsetHeight || currentEstimatedHeight;

                // Vertical Flipping logic for 'top'/'bottom' sides
                if (currentSide === 'bottom' || currentSide === 'top') {
                    const spaceBottom = viewportHeight - (rect.bottom || (rect.top + rect.height)) - 4 - padding;
                    const spaceTop = rect.top - 4 - padding;

                    if (currentSide === 'bottom' && spaceBottom < currentHeight && spaceTop > spaceBottom) {
                        effectiveSide = 'top';
                    } else if (currentSide === 'top' && spaceTop < currentHeight && spaceBottom > spaceTop) {
                        effectiveSide = 'bottom';
                    }
                }

                if (effectiveSide === 'left' || effectiveSide === 'right') {
                    // Vertical alignment for left/right sides
                    top = rect.top;

                    // Clamping for Left/Right Logic (keep vertical in bounds)
                    const currentHeight = tooltipRef.current?.offsetHeight || currentEstimatedHeight;
                    const maxTop = viewportHeight - currentHeight - padding;
                    top = Math.max(padding, Math.min(top, maxTop));

                    const spaceRight = viewportWidth - (rect.right || (rect.left + rect.width)) - 4 - padding;
                    const spaceLeft = rect.left - 4 - padding;

                    if (effectiveSide === 'right' && spaceRight < minWidth && spaceLeft > spaceRight) {
                        effectiveSide = 'left';
                    } else if (effectiveSide === 'left' && spaceLeft < minWidth && spaceRight > spaceLeft) {
                        effectiveSide = 'right';
                    }

                    if (effectiveSide === 'left') {
                        left = rect.left - 4;
                        transform = 'translateX(-100%)';
                        calculatedMaxWidth = left - padding;
                    } else {
                        left = (rect.right || (rect.left + rect.width)) + 4;
                        transform = 'none';
                        calculatedMaxWidth = viewportWidth - left - padding;
                    }
                } else {
                    // Horizontal alignment for top/bottom sides
                    top = effectiveSide === 'bottom' ? (rect.bottom || (rect.top + rect.height)) + 4 : rect.top - 4;

                    // Vertical Clamping Logic
                    // We need to know the visual top/bottom to clamp.
                    // If side=top, visualTop = top - height.
                    // If side=bottom, visualTop = top.

                    const height = tooltipRef.current?.offsetHeight || currentEstimatedHeight;

                    if (effectiveSide === 'top') {
                        // Visual Top is (top - height). We want (top - height) >= padding.
                        // So top >= padding + height.
                        if (top - height < padding) {
                            top = padding + height;
                        }
                    } else {
                        // Visual Bottom is (top + height). We want (top + height) <= viewportHeight - padding.
                        // So top <= viewportHeight - padding - height.
                        if (top + height > viewportHeight - padding) {
                            top = viewportHeight - padding - height;
                        }
                    }


                    const spaceRight = viewportWidth - rect.left - padding;
                    const spaceLeft = (rect.right || (rect.left + rect.width)) - padding;

                    if (currentAlign === 'left' && spaceRight < minWidth && spaceLeft > spaceRight) {
                        effectiveAlign = 'right';
                    } else if (currentAlign === 'right' && spaceLeft < minWidth && spaceRight > spaceLeft) {
                        effectiveAlign = 'left';
                    }

                    if (effectiveAlign === 'left') {
                        left = rect.left;
                        transform = effectiveSide === 'top' ? 'translateY(-100%)' : 'none';
                        calculatedMaxWidth = viewportWidth - left - padding;
                    } else if (effectiveAlign === 'right') {
                        left = (rect.right || (rect.left + rect.width));
                        transform = `translateX(-100%) ${effectiveSide === 'top' ? 'translateY(-100%)' : ''}`;
                        calculatedMaxWidth = left - padding;
                    } else { // center
                        left = rect.left + (rect.width / 2);
                        transform = `translateX(-50%) ${effectiveSide === 'top' ? 'translateY(-100%)' : ''}`;
                        calculatedMaxWidth = Math.min(left - padding, viewportWidth - left - padding) * 2;
                    }
                }

                setPosition({ top, left });
                setMaxWidth(calculatedMaxWidth);
                setFinalTransform(transform);
            }
            positionRaf.current = null;
        });
    }, []); // Stable callback, no dependencies

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
        if (disabled) {
            // Defer update to avoid synchronous state update warning
            const timer = setTimeout(() => hideTooltip(), 0);
            return () => clearTimeout(timer);
        }

        // If disabled state changes to false and we are STILL hovered, re-show
        if (!disabled && isHoveredRef.current && !forceOpen) {
            // Defer update
            const timer = setTimeout(() => showTooltip(), 0);
            return () => clearTimeout(timer);
        }

        if (forceOpen !== undefined) {
            // Defer update
            const timer = setTimeout(() => {
                if (forceOpen) {
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
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [forceOpen, disabled, showTooltip, hideTooltip]);


    const handleMouseEnter = () => {
        if (disabled) return;
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

        // If already rendered/visible, we don't need to queue another show
        // BUT if it's rendered but NOT visible (e.g. in the middle of closing animation), 
        // we MUST restore visibility immediately.
        if (shouldRender) {
            if (!isVisible) {
                setIsVisible(true);
                onOpenChange?.(true);
            }
            return;
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

    // Update position on scroll or resize while visible, AND when props change
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
    }, [shouldRender, updatePosition, anchorRect, align, side]);



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
                <div
                    className={`fixed z-[10000] pointer-events-auto will-change-transform`}
                    style={{
                        top: Math.round(position.top),
                        left: Math.round(position.left),
                        transform: finalTransform,
                        maxWidth: fixedWidth ? undefined : (maxWidth ? Math.round(maxWidth) : undefined),
                        width: fixedWidth ? `${fixedWidth}px` : undefined,
                    }}
                    onPointerEnter={handleMouseEnter} // Keep open when hovering tooltip
                    onPointerLeave={() => {
                        if (forceOpen === undefined) handleMouseLeave();
                    }}
                >
                    <div
                        ref={tooltipRef}
                        className={`
                            text-white text-[11px] leading-relaxed
                            whitespace-normal break-all max-w-full text-left
                            transition-all ease-out origin-top-right
                            ${variant === 'glass'
                                ? 'bg-[#1a1a1a]/85 backdrop-blur-xl p-2 rounded-lg shadow-lg w-auto max-w-[340px]'
                                : 'bg-[#1F1F1F] px-3 py-2 rounded-lg shadow-xl'
                            }
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
