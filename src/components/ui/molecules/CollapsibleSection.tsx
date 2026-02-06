import React, { useState } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';

interface CollapsibleSectionProps {
    title: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
    trailing?: React.ReactNode;
    className?: string;
    variant?: 'default' | 'mini';
    isOpen?: boolean;
    onToggle?: () => void;
    dragHandle?: React.ReactNode;
}

export function CollapsibleSection({
    title,
    children,
    defaultOpen = true,
    trailing,
    dragHandle,
    className = '',
    variant = 'default',
    isOpen: controlledIsOpen,
    onToggle,
}: CollapsibleSectionProps) {
    const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
    const [isOverflowVisible, setOverflowVisible] = useState(defaultOpen);

    const isMini = variant === 'mini';
    const headerClass = isMini
        ? "text-xs font-bold uppercase tracking-widest"
        : "text-xl font-semibold";

    // Shared color transition logic
    const colorClass = "text-text-tertiary group-hover:text-text-primary transition-colors duration-200";

    const iconClass = isMini ? "w-2.5 h-2.5" : "w-5 h-5";
    const gapClass = isMini ? "gap-2" : "gap-3";
    const mbClass = isMini ? "mb-2" : "mb-4";

    const isSectionOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

    React.useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (isSectionOpen) {
            timer = setTimeout(() => setOverflowVisible(true), 300);
        } else {
            setOverflowVisible(false);
        }
        return () => clearTimeout(timer);
    }, [isSectionOpen]);

    const handleToggle = () => {
        if (onToggle) {
            onToggle();
        } else {
            setInternalIsOpen(!internalIsOpen);
        }
    };

    return (
        <div className={`w-full ${className}`}>
            <div className={`flex items-center ${mbClass} group`}>
                {dragHandle && (
                    <div className={`mr-2 ${colorClass}`} onClick={(e) => e.stopPropagation()}>
                        {dragHandle}
                    </div>
                )}
                <div
                    className="flex-grow flex items-center justify-between cursor-pointer"
                    onClick={handleToggle}
                    role="button"
                    aria-expanded={isSectionOpen}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleToggle();
                        }
                    }}
                >
                    <div className={`flex items-center ${gapClass} ${headerClass} text-left`}>
                        <div className={`transition-all duration-200 ${isSectionOpen ? '' : '-rotate-90'} text-text-tertiary group-hover:text-text-primary`}>
                            <ChevronDown className={iconClass} />
                        </div>
                        <span className={colorClass}>{title}</span>
                    </div>

                    {trailing && (
                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            {trailing}
                        </div>
                    )}
                </div>
            </div>

            <div
                className={`
                    grid transition-[grid-template-rows,opacity] duration-300 ease-in-out
                    ${isSectionOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
                    ${isOverflowVisible ? 'overflow-visible' : 'overflow-hidden'}
                `}
            >
                <div className={`${isMini ? "py-0" : "py-1"} min-h-0`}>
                    {children}
                </div>
            </div>
        </div>
    );
}

// Re-export GripVertical for convenience in drag handles
export { GripVertical };
