import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface PortalTooltipProps {
    content: string;
    children: React.ReactNode;
    align?: 'left' | 'right';
}

export const PortalTooltip: React.FC<PortalTooltipProps> = ({ content, children, align = 'right' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();

            setPosition({
                top: Math.round(rect.bottom + 8), // 8px gap
                left: Math.round(align === 'left' ? rect.left : rect.right),
            });
        }
    };

    const handleMouseEnter = () => {
        updatePosition();
        setIsVisible(true);
    };

    const handleMouseLeave = () => {
        setIsVisible(false);
    };

    // Update position on scroll or resize while visible
    useEffect(() => {
        if (isVisible) {
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [isVisible]);

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
                    className="fixed z-[9999] pointer-events-none will-change-transform"
                    style={{
                        top: Math.round(position.top),
                        left: Math.round(position.left),
                        transform: align === 'left' ? 'none' : 'translateX(-100%)',
                    }}
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
