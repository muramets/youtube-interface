import React, { useRef, useState, useEffect } from 'react';
import { FilterDropdown } from '../Video/FilterDropdown';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './WatchPageFilterBar.css';

interface WatchPageFilterBarProps {
    channelName: string;
    selectedFilter: 'all' | 'channel';
    onFilterChange: (filter: 'all' | 'channel') => void;
}

export const WatchPageFilterBar: React.FC<WatchPageFilterBarProps> = ({
    channelName,
    selectedFilter,
    onFilterChange
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
    }, []);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 200;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div className="watch-filter-bar-container">
            {showLeftArrow && (
                <div className="filter-arrow-container left">
                    <button
                        className="filter-arrow-button"
                        onClick={() => scroll('left')}
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>
            )}

            <div
                className="watch-filter-scroll-container"
                ref={scrollContainerRef}
            >
                <button
                    className={`category-pill ${selectedFilter === 'all' ? 'active' : ''}`}
                    onClick={() => onFilterChange('all')}
                >
                    All
                </button>
                <button
                    className={`category-pill ${selectedFilter === 'channel' ? 'active' : ''}`}
                    onClick={() => onFilterChange('channel')}
                >
                    From {channelName}
                </button>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                    <FilterDropdown />
                </div>
            </div>

            {showRightArrow && (
                <div className="filter-arrow-container right">
                    <button
                        className="filter-arrow-button"
                        onClick={() => scroll('right')}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );
};
