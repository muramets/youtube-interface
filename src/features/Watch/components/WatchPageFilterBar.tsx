import React, { useRef, useState, useEffect } from 'react';
import { FilterSortDropdown } from '../../../features/Filter/FilterSortDropdown';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { FilterType, SortOption } from '../../../core/constants/enums';

import { type Playlist } from '../../../core/services/playlistService';

interface WatchPageFilterBarProps {
    channelName: string;
    selectedFilter: FilterType;
    selectedPlaylistIds: string[];
    containingPlaylists: Playlist[];
    onFilterChange: (filter: FilterType) => void;
    onPlaylistToggle: (playlistId: string) => void;
    sortBy: SortOption;
    onSortChange: (sort: SortOption) => void;
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
        { label: 'Default', value: SortOption.DEFAULT },
        { label: 'Most Viewed', value: SortOption.VIEWS },
        { label: 'Newest First', value: SortOption.DATE },
    ];

    return (
        <div className="relative flex items-center w-full mb-4">
            {/* Left arrow */}
            {showLeftArrow && (
                <button
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-bg-secondary hover:bg-hover-bg flex items-center justify-center border-none cursor-pointer text-text-primary shadow-sm transition-colors"
                    onClick={() => scroll('left')}
                >
                    <ChevronLeft size={20} />
                </button>
            )}

            {/* Scrollable filter buttons — mask-image fades edges to transparent */}
            <div
                className="flex gap-3 overflow-x-auto scrollbar-hide px-3 w-full items-center"
                ref={scrollContainerRef}
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    maskImage: (showLeftArrow || showRightArrow) ? `linear-gradient(to right, ${showLeftArrow ? 'transparent 48px, black 96px,' : ''} ${showRightArrow ? 'black calc(100% - 96px), transparent calc(100% - 48px), transparent' : 'black'})` : undefined,
                    WebkitMaskImage: (showLeftArrow || showRightArrow) ? `linear-gradient(to right, ${showLeftArrow ? 'transparent 48px, black 96px,' : ''} ${showRightArrow ? 'black calc(100% - 96px), transparent calc(100% - 48px), transparent' : 'black'})` : undefined,
                }}
            >
                <button
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-colors border-none ${selectedFilter === FilterType.ALL ? 'bg-text-primary text-bg-primary' : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'}`}
                    onClick={() => onFilterChange(FilterType.ALL)}
                >
                    All
                </button>
                <button
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-colors border-none ${selectedFilter === FilterType.CHANNEL ? 'bg-text-primary text-bg-primary' : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'}`}
                    onClick={() => onFilterChange(FilterType.CHANNEL)}
                >
                    From {channelName}
                </button>

                {containingPlaylists.map(playlist => (
                    <button
                        key={playlist.id}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-colors border-none ${selectedFilter === FilterType.PLAYLISTS && selectedPlaylistIds.includes(playlist.id) ? 'bg-text-primary text-bg-primary' : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'}`}
                        onClick={() => onPlaylistToggle(playlist.id)}
                    >
                        From {playlist.name}
                    </button>
                ))}
            </div>

            {/* Sort & revert — outside scroll container */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                <FilterSortDropdown
                    sortOptions={sortOptions}
                    activeSort={sortBy}
                    onSortChange={(val) => onSortChange(val as SortOption)}
                    showPlaylistFilter={true}
                />

                {hasCustomOrder && (
                    <PortalTooltip content={revertTooltip || "Revert order"} align="right">
                        <button
                            className="w-[34px] h-[34px] rounded-full bg-transparent hover:bg-bg-secondary flex items-center justify-center border-none cursor-pointer text-text-primary transition-colors"
                            onClick={onRevert}
                        >
                            <RotateCcw size={18} />
                        </button>
                    </PortalTooltip>
                )}
            </div>

            {/* Right arrow */}
            {showRightArrow && (
                <button
                    className="absolute right-12 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-bg-secondary hover:bg-hover-bg flex items-center justify-center border-none cursor-pointer text-text-primary shadow-sm transition-colors"
                    onClick={() => scroll('right')}
                >
                    <ChevronRight size={20} />
                </button>
            )}
        </div>
    );
};


