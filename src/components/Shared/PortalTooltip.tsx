import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface PortalTooltipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    align?: 'left' | 'center' | 'right';
}

export const PortalTooltip: React.FC<PortalTooltipProps> = ({ content, children, align = 'right' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const positionRaf = useRef<number | null>(null);

    const updatePosition = React.useCallback(() => {
        if (positionRaf.current) return;

        positionRaf.current = requestAnimationFrame(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setPosition({
                    top: Math.round(rect.bottom + 4), // Reduced offset from 8 to 4
                    left: Math.round(align === 'left' ? rect.left : rect.right),
                });
            }
            positionRaf.current = null;
        });
    }, [align]);

    const handleMouseEnter = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        updatePosition();
        setIsVisible(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(false);
        }, 100); // Small delay to allow moving to tooltip
    };

    // Update position on scroll or resize while visible
    useEffect(() => {
        if (isVisible) {
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
    }, [isVisible, updatePosition]);

    return (
        <div
            ref={triggerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="relative inline-flex items-center justify-center"
        >
            {children}
            {isVisible && createPortal(
                <div
                    className="fixed z-[9999] pointer-events-auto will-change-transform" // Changed to pointer-events-auto
                    style={{
                        top: Math.round(position.top),
                        left: Math.round(position.left),
                        transform: align === 'left' ? 'none' : 'translateX(-100%)',
                    }}
                    onMouseEnter={handleMouseEnter} // Keep open when hovering tooltip
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="bg-black/95 text-white text-[11px] leading-relaxed px-3 py-2 rounded-lg whitespace-normal break-words w-max max-w-[250px] shadow-xl text-left backdrop-blur-md animate-fade-in-down will-change-transform">
                        {content}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
