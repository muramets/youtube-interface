import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter } from 'lucide-react';

interface FilterDropdownProps {
    children: React.ReactNode | ((props: { onClose: () => void }) => React.ReactNode);
    title?: string; // Floating title/label for the button (optional)
    badgeCount?: number;
    width?: string; // Custom width for dropdown
    align?: 'left' | 'right';
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
    children,
    title = 'Filter',
    badgeCount = 0,
    width = '240px',
    align = 'right' // default to aligning right edge to button right edge
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left?: number; right?: number } | null>(null);

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            // Default: align dropdown right edge with button right edge
            // If align right: right = window.width - rect.right
            // If align left: left = rect.left

            const pos: { top: number; left?: number; right?: number } = {
                top: rect.bottom + 8
            };

            if (align === 'right') {
                pos.right = window.innerWidth - rect.right;
            } else {
                pos.left = rect.left;
            }

            setPosition(pos);
        }
    }, [isOpen, align]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;

            // Allow ignoring specific elements (like nested portals if any)
            if (target.closest('.ignore-filter-click-outside')) {
                return;
            }

            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('resize', () => setIsOpen(false));
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', () => setIsOpen(false));
        };
    }, [isOpen]);

    return (
        <>
            <button
                ref={buttonRef}
                className={`w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${isOpen ? 'bg-text-primary text-bg-primary' : 'bg-transparent text-text-primary hover:bg-hover-bg'
                    }`}
                onClick={() => setIsOpen(!isOpen)}
                title={title}
            >
                <Filter size={20} />
                {badgeCount > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-bg-primary" />
                )}
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-dropdown bg-[#1F1F1F] rounded-xl shadow-2xl overflow-hidden animate-scale-in flex flex-col"
                    style={{
                        top: position.top,
                        left: position.left,
                        right: position.right,
                        width: width
                    }}
                >
                    {typeof children === 'function' ? children({ onClose: () => setIsOpen(false) }) : children}
                </div>,
                document.body
            )}
        </>
    );
};
