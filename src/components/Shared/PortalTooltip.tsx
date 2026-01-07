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
                const tooltipWidth = tooltipRef.current?.offsetWidth || 0;
                let top = 0;
                let left = 0;

                if (side === 'bottom') {
                    top = rect.bottom + 8;
                    if (align === 'right') left = rect.right;
                    else if (align === 'center') left = rect.left + (rect.width / 2);
                    else left = rect.left;
                } else if (side === 'top') {
                    top = rect.top - 8;
                    if (align === 'right') left = rect.right;
                    else if (align === 'center') left = rect.left + (rect.width / 2);
                    else left = rect.left;
                } else if (side === 'left') {
                    top = rect.top; // Align top-to-top by default for side
                    left = rect.left - 8;
                } else if (side === 'right') {
                    top = rect.top;
                    left = rect.right + 8;
                }

                // Ensure tooltip stays within viewport bounds
                const padding = 16;

                // For right-aligned tooltips, account for the translateX(-100%) transform
                if (align === 'right' && tooltipWidth > 0) {
                    // After transform, the tooltip's left edge will be at: left - tooltipWidth
                    const effectiveLeft = left - tooltipWidth;
                    if (effectiveLeft < padding) {
                        // Shift right to prevent clipping
                        left = padding + tooltipWidth;
                    }
                }

                setPosition({ top, left });
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

    const getTransform = () => {
        if (side === 'left') return 'translateX(-100%)';
        if (side === 'top') return 'translateY(-100%)';
        if (side === 'right') return 'none'; // Default origin is top-left, so it grows right.
        if (side === 'bottom') {
            // legacy handling based on align
            return align === 'left' ? 'none' : 'translateX(-100%)';
        }
        return 'none';
    };

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
                        transform: getTransform(),
                    }}
                    onPointerEnter={handleMouseEnter} // Keep open when hovering tooltip
                    onPointerLeave={handleMouseLeave}
                >
                    <div
                        ref={tooltipRef}
                        className={`
                            bg-[#1F1F1F] text-white text-[11px] leading-relaxed px-3 py-2 rounded-lg
                            whitespace-normal break-words w-max shadow-xl text-left border border-white/10
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
