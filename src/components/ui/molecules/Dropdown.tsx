import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownProps extends React.HTMLAttributes<HTMLDivElement> {
    isOpen: boolean;
    onClose: () => void;
    anchorEl: HTMLElement | null;
    children: React.ReactNode;
    className?: string;
    width?: number;
    align?: 'left' | 'right';
    zIndexClass?: string;
    connected?: boolean;
}

export const Dropdown: React.FC<DropdownProps> = ({
    isOpen,
    onClose,
    anchorEl,
    children,
    className = '',
    width = 300,
    align = 'right',
    zIndexClass = 'z-dropdown',
    connected = false,
    ...props
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && anchorEl) {
            const updatePosition = () => {
                const rect = anchorEl.getBoundingClientRect();
                const menuHeight = dropdownRef.current?.offsetHeight || 400;
                const gap = connected ? 0 : 8;

                let top = rect.bottom + gap;
                let left = connected
                    ? rect.left
                    : align === 'right' ? rect.right - width : rect.left;

                const windowWidth = window.innerWidth;
                if (left < 16) left = 16;
                if (left + width > windowWidth - 16) left = windowWidth - width - 16;

                const windowHeight = window.innerHeight;

                if (top + menuHeight > windowHeight) {
                    if (rect.top - menuHeight - gap > 0) {
                        top = Math.min(top, windowHeight - menuHeight - 16);
                    }
                }

                if (top + menuHeight > windowHeight) {
                    top = rect.top - menuHeight - gap;
                }

                setPosition({ top, left });
            };

            updatePosition();
        }
    }, [isOpen, anchorEl, width, align, connected]);

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

        const handleScroll = (event: Event) => {
            if (
                dropdownRef.current &&
                dropdownRef.current.contains(event.target as Node)
            ) {
                return;
            }
            onClose();
        };

        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        window.addEventListener('resize', handleResize);
        if (!connected) {
            window.addEventListener('scroll', handleScroll, true);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside, { capture: true });
            window.removeEventListener('resize', handleResize);
            if (!connected) {
                window.removeEventListener('scroll', handleScroll, true);
            }
        };
    }, [isOpen, onClose, anchorEl, connected]);

    if (!isOpen) return null;

    const connectedStyle = connected
        ? 'rounded-t-none rounded-b-lg border-t-0'
        : 'rounded-xl';

    return createPortal(
        <div
            ref={dropdownRef}
            className={`fixed ${zIndexClass} bg-bg-secondary ${connectedStyle} border border-border shadow-2xl animate-scale-in overflow-hidden ${className}`}
            style={{
                top: position.top,
                left: position.left,
                width: `${width}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            {...props}
        >
            {children}
        </div>,
        document.body
    );
};
