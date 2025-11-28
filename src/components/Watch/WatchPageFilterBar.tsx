import React, { useRef, useState, useEffect } from 'react';
import { FilterSortDropdown } from '../Shared/FilterSortDropdown';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { PortalTooltip } from '../Shared/PortalTooltip';

import { type Playlist } from '../../context/VideoContext';

interface WatchPageFilterBarProps {
    channelName: string;
    selectedFilter: 'all' | 'channel' | 'playlists';
    selectedPlaylistIds: string[];
    containingPlaylists: Playlist[];
    onFilterChange: (filter: 'all' | 'channel') => void;
    onPlaylistToggle: (playlistId: string) => void;
    sortBy: 'default' | 'views' | 'date';
    onSortChange: (sort: 'default' | 'views' | 'date') => void;
    hasCustomOrder?: boolean;
    onRevert?: () => void;
    revertTooltip?: string;
}

export const WatchPageFilterBar: React.FC<WatchPageFilterBarProps> = ({
    channelName,
    selectedFilter,
    selectedPlaylistIds,
    containingPlaylists,
    onFilterChange,
    onPlaylistToggle,
    sortBy,
    onSortChange,
    hasCustomOrder,
    onRevert,
    revertTooltip
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    // ... (checkScroll and scroll functions remain same, omitted for brevity in replacement if possible, but I must provide full context for contiguous block)
    // Actually, I can just target the top part and the bottom part separately or use a larger block.
    // I'll use a larger block to be safe.

    const scrollCheckRaf = useRef<number | null>(null);

    const checkScroll = () => {
        if (!scrollContainerRef.current) return;

        if (scrollCheckRaf.current) return;

        scrollCheckRaf.current = requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
                const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;

                // Precise check for scroll ends
                // Use a small tolerance (2px) to account for sub-pixel rendering
                const isAtStart = scrollLeft <= 2;
                const isAtEnd = Math.abs(scrollWidth - clientWidth - scrollLeft) <= 2;

                // Directly set state to avoid stale closure issues
                setShowLeftArrow(!isAtStart);
                setShowRightArrow(!isAtEnd);
            }
            scrollCheckRaf.current = null;
        });
    };

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', checkScroll);
            window.addEventListener('resize', checkScroll);

            // Force initial checks
            checkScroll();
            // Multiple checks to handle layout shifts/loading
            const t1 = setTimeout(checkScroll, 100);
            const t2 = setTimeout(checkScroll, 500);
            const t3 = setTimeout(checkScroll, 1000);

            return () => {
                container.removeEventListener('scroll', checkScroll);
                window.removeEventListener('resize', checkScroll);
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                if (scrollCheckRaf.current) {
                    cancelAnimationFrame(scrollCheckRaf.current);
                    scrollCheckRaf.current = null;
                }
            };
        }
    }, [containingPlaylists, selectedFilter, hasCustomOrder]); // Added hasCustomOrder dependency // Re-check when content changes

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 200;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };



    const sortOptions = [
        { label: 'Default', value: 'default' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Newest First', value: 'date' },
    ];

    return (
        <div className="relative flex items-start w-full mb-4">
            {showLeftArrow && (
                <div className="absolute left-0 top-0 z-10 flex items-center bg-gradient-to-r from-bg-primary via-bg-primary to-transparent pr-12 pl-2 h-full pointer-events-none">
                    <button
                        className="w-8 h-8 rounded-full bg-bg-secondary hover:bg-hover-bg flex items-center justify-center border-none cursor-pointer text-text-primary shadow-sm pointer-events-auto transition-colors"
                        onClick={() => scroll('left')}
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>
            )}

            <div
                className="flex gap-3 overflow-x-auto scrollbar-hide px-3 pr-12 w-full items-center"
                ref={scrollContainerRef}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <button
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-colors border-none ${selectedFilter === 'all' ? 'bg-text-primary text-bg-primary' : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'}`}
                    onClick={() => onFilterChange('all')}
                >
                    All
                </button>
                <button
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-colors border-none ${selectedFilter === 'channel' ? 'bg-text-primary text-bg-primary' : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'}`}
                    onClick={() => onFilterChange('channel')}
                >
                    From {channelName}
                </button>

                {containingPlaylists.map(playlist => (
                    <button
                        key={playlist.id}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-colors border-none ${selectedFilter === 'playlists' && selectedPlaylistIds.includes(playlist.id) ? 'bg-text-primary text-bg-primary' : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'}`}
                        onClick={() => onPlaylistToggle(playlist.id)}
                    >
                        From {playlist.name}
                    </button>
                ))}

                <FilterSortDropdown
                    sortOptions={sortOptions}
                    activeSort={sortBy}
                    onSortChange={(val) => onSortChange(val as any)}
                    showPlaylistFilter={true}
                />

                {hasCustomOrder && (
                    <div className="relative group flex items-center h-[34px]">
                        <PortalTooltip content={revertTooltip || "Revert order"} align="right">
                            <button
                                className="w-[34px] h-[34px] rounded-full bg-transparent hover:bg-bg-secondary flex items-center justify-center border-none cursor-pointer text-text-primary transition-colors"
                                onClick={onRevert}
                            >
                                <RotateCcw size={18} />
                            </button>
                        </PortalTooltip>
                    </div>
                )}
            </div>

            {showRightArrow && (
                <div className="absolute right-0 top-0 z-10 flex items-center bg-gradient-to-l from-bg-primary via-bg-primary to-transparent pl-12 pr-2 h-full pointer-events-none">
                    <button
                        className="w-8 h-8 rounded-full bg-bg-secondary hover:bg-hover-bg flex items-center justify-center border-none cursor-pointer text-text-primary shadow-sm pointer-events-auto transition-colors"
                        onClick={() => scroll('right')}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );
};


