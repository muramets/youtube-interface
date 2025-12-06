import React, { useMemo } from 'react';
import { useVideos } from '../../hooks/useVideos';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';

import { useFilterStore } from '../../stores/filterStore';
import { SortButton } from '../Shared/SortButton';
import { FilterButton } from '../Shared/FilterButton';
import { X } from 'lucide-react';

export const CategoryBar: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const {
        selectedChannel,
        setSelectedChannel,
        homeSortBy,
        setHomeSortBy,
        activeFilters,
        removeFilter
    } = useFilterStore();

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
        <div className="flex flex-col sticky top-0 bg-bg-primary z-10 transition-all">
            {/* Row 1: Controls & Categories */}
            <div className="flex items-center pl-0 pr-6 py-2 overflow-hidden">
                <div className="flex gap-3 overflow-x-auto scrollbar-hide flex-1 items-center pr-2">
                    {categories.map((category, index) => (
                        <button
                            key={index}
                            className={`px-3 py-1.5 rounded-lg border-none cursor-pointer whitespace-nowrap font-medium text-sm transition-colors flex-shrink-0 ${selectedChannel === category
                                ? 'bg-text-primary text-bg-primary'
                                : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                                }`}
                            onClick={() => setSelectedChannel(category)}
                        >
                            {category}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center pl-4 bg-gradient-to-l from-bg-primary via-bg-primary to-transparent gap-2 flex-shrink-0">
                    <SortButton
                        sortOptions={sortOptions}
                        activeSort={homeSortBy}
                        onSortChange={(val) => setHomeSortBy(val as 'default' | 'views' | 'date')}
                    />
                    <FilterButton />
                </div>
            </div>

            {/* Row 2: Active Filter Chips (if any) */}
            {activeFilters.length > 0 && (
                <div className="flex gap-2 pl-0 pr-6 pb-3 overflow-x-auto scrollbar-hide animate-fade-in">
                    {activeFilters.map(filter => (
                        <div
                            key={filter.id}
                            className="flex items-center gap-2 bg-[#F2F2F2]/10 hover:bg-[#F2F2F2]/20 border-none rounded-lg px-3 py-1.5 text-sm font-medium text-text-primary whitespace-nowrap animate-scale-in group transition-colors"
                        >
                            <span>{filter.label}</span>
                            <button
                                onClick={() => removeFilter(filter.id)}
                                className="p-0.5 rounded-full hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
