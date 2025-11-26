import React from 'react';
import { useVideo } from '../../context/VideoContext';
import { FilterDropdown } from './FilterDropdown';

export const CategoryBar: React.FC = () => {
    const { uniqueChannels, selectedChannel, setSelectedChannel } = useVideo();
    const categories = ['All', ...uniqueChannels];

    return (
        <div className="flex gap-3 px-6 py-3 overflow-x-auto sticky top-0 bg-bg-primary z-10 flex-shrink-0 scrollbar-hide">
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
            <div className="ml-auto flex items-center">
                <FilterDropdown />
            </div>
        </div>
    );
};
