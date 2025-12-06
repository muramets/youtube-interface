import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface Option<T extends string | number> {
    label: string;
    value: T;
}

interface CustomSelectProps<T extends string | number> {
    options: Option<T>[];
    value: T;
    onChange: (value: T) => void;
    placeholder?: string;
    className?: string; // wrapper style
}

export const CustomSelect = <T extends string | number>({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    className = ''
}: CustomSelectProps<T>) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Check if click is outside both container and portal content
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                // We also need to check if we clicked inside the portal, but since the portal is usually separate,
                // we rely on the fact that if we click OUTSIDE the trigger, we close.
                // However, clicking an option closes it anyway.
                // Clicking scrollbar?
                // Proper way: assign ref to dropdown menu.
                const dropdown = document.getElementById('custom-select-dropdown');
                if (dropdown && dropdown.contains(event.target as Node)) {
                    return;
                }
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            // Removed scroll listener as it was causing the dropdown to close when scrolling inside it (though now scroll is gone)
            // or just generally annoying if the user tries to scroll the page a tiny bit.
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    }, [isOpen]);

    const handleSelect = (optionValue: T) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-full flex items-center justify-between
                    bg-transparent border-b border-[#333333] hover:border-[#555555]
                    py-1 cursor-pointer transition-colors
                    text-base text-white
                    ${isOpen ? 'border-[#3EA6FF]' : ''}
                `}
            >
                <div className="flex-1 text-center">
                    <span className={selectedOption ? 'text-white' : 'text-[#AAAAAA]'}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <ChevronDown
                    size={14}
                    className={`text-[#AAAAAA] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </div>

            {isOpen && createPortal(
                <div
                    id="custom-select-dropdown"
                    className="fixed z-[9999] bg-[#222222] border border-[#333333] rounded-md shadow-xl"
                    style={{
                        top: position.top,
                        left: position.left,
                        width: position.width,
                        // Removed max-height and overflow-y-auto as requested
                    }}
                >
                    {options.map((option) => (
                        <div
                            key={String(option.value)}
                            onClick={() => handleSelect(option.value)}
                            className={`
                                flex items-center justify-center relative px-3 py-2 cursor-pointer
                                hover:bg-[#333333] transition-colors text-center
                                ${option.value === value ? 'bg-[#333333] text-white' : 'text-[#AAAAAA] hover:text-white'}
                            `}
                        >
                            <span className="text-sm">{option.label}</span>
                            {option.value === value && <Check size={14} className="absolute right-3 text-[#3EA6FF]" />}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};
