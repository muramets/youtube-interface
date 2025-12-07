
import React, { useRef, useState, useEffect } from 'react';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

export interface SubTab {
    id: string;
    label: string;
    icon?: React.ReactNode;
    color?: string;
    count?: number;
    data?: any;
    onDelete?: () => void;
}

interface SubTabsProps {
    tabs: SubTab[];
    activeTabId: string;
    onTabChange: (id: string) => void;
    className?: string;
}

export const SubTabs: React.FC<SubTabsProps> = ({
    tabs,
    activeTabId,
    onTabChange,
    className = ''
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showLeftGradient, setShowLeftGradient] = useState(false);
    const [showRightGradient, setShowRightGradient] = useState(false);

    // Check scroll position to toggle gradients
    const checkScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
        setShowLeftGradient(scrollLeft > 0);
        setShowRightGradient(scrollLeft < scrollWidth - clientWidth - 1); // -1 buffer for float precision
    };

    // Initial check and event listener
    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [tabs]);

    // Scroll handlers
    const scroll = (direction: 'left' | 'right') => {
        if (!scrollContainerRef.current) return;
        const scrollAmount = 200;
        scrollContainerRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    };

    return (
        <div className={`relative group ${className}`}>
            {/* Left Gradient & Button */}
            <div
                className={`absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-bg-secondary to-transparent z-10 transition-opacity duration-300 pointer-events-none ${showLeftGradient ? 'opacity-100' : 'opacity-0'}`}
            />
            {showLeftGradient && (
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center rounded-full bg-[#1F1F1F] text-white shadow-lg hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <ChevronLeft size={14} />
                </button>
            )}

            {/* Scroll Container */}
            <div
                ref={scrollContainerRef}
                onScroll={checkScroll}
                className="flex items-center gap-2 overflow-x-auto scrollbar-none px-4 pb-0"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {tabs.map(tab => {
                    const isActive = activeTabId === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => {
                                onTabChange(tab.id);
                                // Optional: center the clicked tab
                                // e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                            }}
                            className={`
                                relative flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-b-lg transition-all whitespace-nowrap select-none
                                ${isActive
                                    ? 'text-text-primary bg-white/5'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                                }
                            `}
                        >
                            {/* Active Indicator Line */}
                            {isActive && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-primary" />
                            )}

                            {/* Niche Color Dot */}
                            {tab.color && (
                                <div
                                    className="w-2 h-2 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)]"
                                    style={{ backgroundColor: tab.color }}
                                />
                            )}

                            {/* Icon */}
                            {tab.icon && (
                                <span className={isActive ? 'text-text-primary' : 'text-text-secondary'}>
                                    {tab.icon}
                                </span>
                            )}

                            {/* Label */}
                            <span>{tab.label}</span>

                            {/* Count Badge */}
                            {tab.count !== undefined && (
                                <span className={`
                                    ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold
                                    ${isActive ? 'bg-white/10 text-white' : 'bg-white/5 text-text-secondary'}
                                `}>
                                    {tab.count}
                                </span>
                            )}

                            {/* Delete Action */}
                            {tab.onDelete && (
                                <div
                                    role="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        tab.onDelete?.();
                                    }}
                                    className="ml-1 p-1 rounded-full text-text-secondary hover:text-red-500 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={12} />
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Right Gradient & Button */}
            <div
                className={`absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-bg-secondary to-transparent z-10 transition-opacity duration-300 pointer-events-none ${showRightGradient ? 'opacity-100' : 'opacity-0'}`}
            />
            {showRightGradient && (
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center rounded-full bg-[#1F1F1F] text-white shadow-lg hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <ChevronRight size={14} />
                </button>
            )}
        </div>
    );
};
