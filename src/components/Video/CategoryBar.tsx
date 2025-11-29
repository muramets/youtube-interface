import React, { useMemo } from 'react';
import { useVideosStore } from '../../stores/videosStore';
import { useFilterStore } from '../../stores/filterStore';
import { FilterSortDropdown } from '../Shared/FilterSortDropdown';

export const CategoryBar: React.FC = () => {
    const { videos } = useVideosStore();
    const { selectedChannel, setSelectedChannel, homeSortBy, setHomeSortBy } = useFilterStore();

    const uniqueChannels = useMemo(() => {
        const channels = new Set(videos.map(v => v.channelTitle));
        return Array.from(channels).sort();
    }, [videos]);

    const categories = ['All', ...uniqueChannels];

    const sortOptions = [
        { label: 'Default (Manual)', value: 'default' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Newest First', value: 'date' },
    ];

    return (
        <div className="flex gap-3 pl-0 pr-6 py-3 overflow-x-auto sticky top-0 bg-bg-primary z-10 flex-shrink-0 scrollbar-hide items-center">
            {categories.map((category, index) => (
                <button
                    key={index}
                    className={`px-3 py-1.5 rounded-lg border-none cursor-pointer whitespace-nowrap font-medium text-sm transition-colors ${selectedChannel === category
                        ? 'bg-text-primary text-bg-primary'
                        : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                        }`}
                    onClick={() => setSelectedChannel(category)}
                >
                    {category}
                </button>
            ))}
            <div className="ml-auto flex items-center pl-2 sticky right-0 bg-gradient-to-l from-bg-primary via-bg-primary to-transparent gap-1">
                <FilterSortDropdown
                    sortOptions={sortOptions}
                    activeSort={homeSortBy}
                    onSortChange={(val) => setHomeSortBy(val as 'default' | 'views' | 'date')}
                    showPlaylistFilter={true}
                />
            </div>
        </div>
    );
};
