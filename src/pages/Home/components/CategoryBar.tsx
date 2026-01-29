import React, { useMemo } from 'react';
import { useVideos } from '../../../core/hooks/useVideos';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

import { usePlaylists } from '../../../core/hooks/usePlaylists';
import { useSettings } from '../../../core/hooks/useSettings';
import { useFilterStore } from '../../../core/stores/filterStore';
import { SortButton } from '../../../features/Filter/SortButton';
import { FilterButton } from '../../../features/Filter/FilterButton';
import { X } from 'lucide-react';

export const CategoryBar: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlists } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { generalSettings } = useSettings();

    const {
        selectedChannel,
        setSelectedChannel,
        homeSortBy,
        setHomeSortBy,
        activeFilters,
        removeFilter
    } = useFilterStore();

    // Dynamically filter videos to match VideoGrid (Home Page) logic
    const uniqueChannels = useMemo(() => {
        // 1. Identify hidden video IDs from settings
        const hiddenPlaylistIds = generalSettings.hiddenPlaylistIds || [];
        const hiddenVideoIds = new Set<string>();

        playlists.forEach(playlist => {
            if (hiddenPlaylistIds.includes(playlist.id)) {
                playlist.videoIds.forEach(id => hiddenVideoIds.add(id));
            }
        });

        // 2. Filter the videos
        const filteredVideos = videos.filter(v => {
            // Exclude playlist-only videos (they don't belong on Home)
            if (v.isPlaylistOnly) return false;

            // Exclude videos from hidden playlists
            if (hiddenVideoIds.has(v.id)) return false;

            return true;
        });

        // 3. Extract unique channels from valid videos
        const channels = new Set(filteredVideos.map(v => v.channelTitle));
        return Array.from(channels).sort();
    }, [videos, playlists, generalSettings.hiddenPlaylistIds]);

    const categories = useMemo(() => {
        const allOption = { label: 'All', value: 'All' };

        const channelOptions = uniqueChannels.map(channel => ({
            label: channel === currentChannel?.name ? 'My Channel' : channel,
            value: channel
        }));

        return [allOption, ...channelOptions];
    }, [uniqueChannels, currentChannel?.name]);

    const sortOptions = [
        { label: 'Default (Manual)', value: 'default' },
        { label: 'Recently Added', value: 'recently_added' },
        { label: 'Most Viewed', value: 'views' },
        { label: 'Newest First', value: 'date' },
    ];

    return (
        <div className="flex flex-col sticky top-0 bg-bg-primary z-10 transition-all">
            {/* Row 1: Controls & Categories */}
            <div className="flex items-center pl-0 pr-6 pt-3 pb-[11px] overflow-hidden">
                <div className="flex gap-3 overflow-x-auto scrollbar-hide flex-1 items-center pr-2">
                    {categories.map((category) => (
                        <button
                            key={category.value}
                            className={`px-3 py-1.5 rounded-lg border-none cursor-pointer whitespace-nowrap font-medium text-sm transition-colors flex-shrink-0 ${selectedChannel === category.value
                                ? 'bg-text-primary text-bg-primary'
                                : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                                }`}
                            onClick={() => setSelectedChannel(category.value)}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center pl-4 bg-gradient-to-l from-bg-primary via-bg-primary to-transparent gap-2 flex-shrink-0">
                    <SortButton
                        sortOptions={sortOptions}
                        activeSort={homeSortBy}
                        onSortChange={(val) => setHomeSortBy(val as 'default' | 'views' | 'date' | 'recently_added')}
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
