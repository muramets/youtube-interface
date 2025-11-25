import React from 'react';
import { useVideo } from '../../context/VideoContext';
import { FilterDropdown } from './FilterDropdown';

export const CategoryBar: React.FC = () => {
    const { uniqueChannels, selectedChannel, setSelectedChannel } = useVideo();
    const categories = ['All', ...uniqueChannels];

    return (
        <div className="categories">
            {categories.map((category, index) => (
                <button
                    key={index}
                    className={`category-pill ${selectedChannel === category ? 'active' : ''}`}
                    onClick={() => setSelectedChannel(category)}
                >
                    {category}
                </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                <FilterDropdown />
            </div>
        </div>
    );
};
