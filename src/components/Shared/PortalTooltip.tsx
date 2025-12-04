import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface PortalTooltipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    align?: 'left' | 'center' | 'right';
    onOpenChange?: (isOpen: boolean) => void;
    className?: string;
    enterDelay?: number;
}

export const PortalTooltip: React.FC<PortalTooltipProps> = ({
    content,
    children,
    align = 'left',
    onOpenChange,
    className = '',
    enterDelay = 0
}) => {
    const [isVisible, setIsVisible] = useState(false); // Controls visual opacity/transform
    const [shouldRender, setShouldRender] = useState(false); // Controls mounting
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
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
                const top = rect.bottom + 8; // 8px gap
                let left = rect.left;

                if (align === 'right') {
                    left = rect.right;
                } else if (align === 'center') {
                    left = rect.left + (rect.width / 2);
                }

                setPosition({ top, left });
            }
            positionRaf.current = null;
        });
    }, [align]);

    const showTooltip = () => {
        if (!isHoveredRef.current) return;

        updatePosition();
        setShouldRender(true);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (isHoveredRef.current) {
                    setIsVisible(true);
                    onOpenChange?.(true);
                }
            });
        });
    };

    const handleMouseEnter = () => {
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
        isHoveredRef.current = false;

        if (enterTimeoutRef.current) {
            clearTimeout(enterTimeoutRef.current);
            enterTimeoutRef.current = null;
        }

        timeoutRef.current = setTimeout(() => {
            setIsVisible(false);
            // Sync exit: notify parent immediately when fading starts
            onOpenChange?.(false);

            // Wait for animation to finish before unmounting
            closeTimeoutRef.current = setTimeout(() => {
                if (!isHoveredRef.current) {
                    setShouldRender(false);
                }
            }, 200); // Match transition duration
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
            className="relative inline-flex items-center justify-center"
        >
            {children}
            {shouldRender && createPortal(
                <div
                    className="fixed z-[1200] pointer-events-auto will-change-transform"
                    style={{
                        top: Math.round(position.top),
                        left: Math.round(position.left),
                        transform: align === 'left' ? 'none' : 'translateX(-100%)',
                    }}
                    onPointerEnter={handleMouseEnter} // Keep open when hovering tooltip
                    onPointerLeave={handleMouseLeave}
                >
                    <div
                        className={`
                            bg-[#1F1F1F] text-white text-[11px] leading-relaxed px-3 py-2 rounded-lg
                            whitespace-normal break-words w-max max-w-[250px] shadow-xl text-left border border-white/10
                            transition-all duration-200 ease-out origin-top-right
                            ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'}
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
