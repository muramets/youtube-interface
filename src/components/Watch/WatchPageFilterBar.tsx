import React, { useRef, useState, useEffect } from 'react';
import { FilterSortDropdown } from '../Shared/FilterSortDropdown';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
}

export const WatchPageFilterBar: React.FC<WatchPageFilterBarProps> = ({
    channelName,
    selectedFilter,
    selectedPlaylistIds,
    containingPlaylists,
    onFilterChange,
    onPlaylistToggle,
    sortBy,
    onSortChange
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    const checkScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
            setShowLeftArrow(scrollLeft > 0);
            // Use a small tolerance (e.g., 1px) for float calculation differences
            setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
        }
    };

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', checkScroll);
            window.addEventListener('resize', checkScroll);
            // Initial check
            checkScroll();
            // Check again after a short delay to ensure layout is stable
            setTimeout(checkScroll, 100);

            return () => {
                container.removeEventListener('scroll', checkScroll);
                window.removeEventListener('resize', checkScroll);
            };
        }
    }, [containingPlaylists]); // Re-check scroll when playlists change

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
                <div className="absolute left-0 top-0 z-10 flex items-center bg-gradient-to-r from-bg-primary via-bg-primary to-transparent pr-4 pl-0 h-full">
                    <button
                        className="w-8 h-8 rounded-full bg-transparent hover:bg-bg-secondary flex items-center justify-center border-none cursor-pointer text-text-primary shadow-sm"
                        onClick={() => scroll('left')}
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>
            )}

            <div
                className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth px-1 w-full items-start"
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
            </div>

            {showRightArrow && (
                <div className="absolute right-0 top-0 z-10 flex items-center bg-gradient-to-l from-bg-primary via-bg-primary to-transparent pl-4 pr-0 h-full">
                    <button
                        className="w-8 h-8 rounded-full bg-transparent hover:bg-bg-secondary flex items-center justify-center border-none cursor-pointer text-text-primary shadow-sm"
                        onClick={() => scroll('right')}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );
};
