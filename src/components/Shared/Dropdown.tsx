import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownProps {
    isOpen: boolean;
    onClose: () => void;
    anchorEl: HTMLElement | null;
    children: React.ReactNode;
    className?: string;
    width?: number;
}

export const Dropdown: React.FC<DropdownProps> = ({
    isOpen,
    onClose,
    anchorEl,
    children,
    className = '',
    width = 300
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && anchorEl) {
            const updatePosition = () => {
                const rect = anchorEl.getBoundingClientRect();
                const menuHeight = dropdownRef.current?.offsetHeight || 400; // Estimate if not rendered yet

                let top = rect.bottom + 8;
                let left = rect.right - width;

                // Adjust if going off screen
                if (left < 16) left = 16;
                const windowHeight = window.innerHeight;

                // If it goes below the viewport, flip it up or adjust
                if (top + menuHeight > windowHeight) {
                    // Try to fit it above if there's space, otherwise just pin to bottom with some padding
                    if (rect.top - menuHeight - 8 > 0) {
                        // top = rect.top - menuHeight - 8; // Optional: flip up behavior
                        // For now, let's just ensure it doesn't go too far down, or maybe max-height scroll?
                        // Youtube usually just scrolls the menu or keeps it within bounds.
                        // Let's just clamp it for now or leave as is if the user didn't complain about flipping.
                        // The original code had logic to flip up:
                        // if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight - 8;
                        top = Math.min(top, windowHeight - menuHeight - 16);
                    }
                }

                // Re-implementing the original logic's flip check more robustly
                if (top + menuHeight > windowHeight) {
                    top = rect.top - menuHeight - 8;
                }

                setPosition({ top, left });
            };

            updatePosition();
            // We might need to update on resize too, but the effect below handles generic resize
        }
    }, [isOpen, anchorEl, width]);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                anchorEl &&
                !anchorEl.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        const handleResize = () => {
            onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', onClose, true); // Capture scroll events

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', onClose, true);
        };
    }, [isOpen, onClose, anchorEl]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={dropdownRef}
            className={`fixed z-50 bg-bg-secondary rounded-xl border border-border shadow-2xl overflow-hidden animate-scale-in ${className}`}
            style={{
                top: position.top,
                left: position.left,
                width: `${width}px`,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
};
