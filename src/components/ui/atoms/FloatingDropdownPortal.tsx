import React from 'react';
import { createPortal } from 'react-dom';

interface FloatingDropdownPortalProps {
    isOpen: boolean;
    anchorRect: DOMRect | null;
    openAbove: boolean;
    width?: number;
    children: React.ReactNode;
}

export const FloatingDropdownPortal: React.FC<FloatingDropdownPortalProps> = ({
    isOpen,
    anchorRect,
    openAbove,
    width = 288,
    children
}) => {
    if (!isOpen || !anchorRect) return null;

    const GAP = 8;
    const PADDING = 16;
    const screenWidth = window.innerWidth;

    // Horizontal: center or clamp
    let left = anchorRect.left;
    if (width === 256) { // Special case for smaller playlist dropdown to center it
        left = anchorRect.left + anchorRect.width / 2 - width / 2;
    }

    if (left + width > screenWidth - PADDING) {
        left = screenWidth - PADDING - width;
    }
    if (left < PADDING) {
        left = PADDING;
    }

    const top = openAbove ? anchorRect.top - GAP : anchorRect.bottom + GAP;

    return createPortal(
        <div
            className="fixed bg-bg-secondary/90 backdrop-blur-md border border-border rounded-xl shadow-lg overflow-hidden flex flex-col animate-fade-in z-popover"
            style={{
                left,
                top,
                width,
                transform: openAbove ? 'translateY(-100%)' : 'none',
                maxHeight: 320,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
};
