import React, { useState, useRef, useEffect } from 'react';
import { ArrowDownUp, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface SortOption {
    label: string;
    value: string;
}

interface SortButtonProps {
    sortOptions: SortOption[];
    activeSort: string;
    onSortChange: (value: string) => void;
}

export const SortButton: React.FC<SortButtonProps> = ({
    sortOptions,
    activeSort,
    onSortChange
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right
            });
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
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
            window.addEventListener('scroll', () => setIsOpen(false), true);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', () => setIsOpen(false));
            window.removeEventListener('scroll', () => setIsOpen(false), true);
        };
    }, [isOpen]);

    return (
        <>
            <button
                ref={buttonRef}
                className={`w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${isOpen ? 'bg-text-primary text-bg-primary' : 'bg-transparent text-text-primary hover:bg-hover-bg'}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Sort"
            >
                <ArrowDownUp size={20} />
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[1000] bg-[#1F1F1F] rounded-xl shadow-2xl min-w-[200px] overflow-hidden animate-scale-in"
                    style={{
                        top: position.top,
                        right: position.right,
                    }}
                >
                    <div className="p-2">
                        <div className="px-3 py-2 text-xs font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-2 border-b border-[#333333] mb-1">
                            Sort By
                        </div>
                        {sortOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => {
                                    onSortChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between transition-colors border-none cursor-pointer ${activeSort === option.value ? 'bg-[#333333] text-white' : 'text-[#AAAAAA] hover:bg-[#161616] hover:text-white bg-transparent'}`}
                            >
                                {option.label}
                                {activeSort === option.value && <Check size={16} />}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
