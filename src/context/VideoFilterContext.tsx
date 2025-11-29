import React, { createContext, useContext, useState } from 'react';

interface VideoFilterContextType {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    selectedChannel: string;
    setSelectedChannel: (channel: string) => void;
    homeSortBy: 'default' | 'views' | 'date';
    setHomeSortBy: (sort: 'default' | 'views' | 'date') => void;
}

const VideoFilterContext = createContext<VideoFilterContextType | undefined>(undefined);

export const useVideoFiltering = () => {
    const context = useContext(VideoFilterContext);
    if (!context) {
        throw new Error('useVideoFiltering must be used within a VideoFilterProvider');
    }
    return context;
};

export const VideoFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedChannel, setSelectedChannel] = useState('All');
    const [homeSortBy, setHomeSortBy] = useState<'default' | 'views' | 'date'>('default');

    return (
        <VideoFilterContext.Provider value={{
            searchQuery,
            setSearchQuery,
            selectedChannel,
            setSelectedChannel,
            homeSortBy,
            setHomeSortBy
        }}>
            {children}
        </VideoFilterContext.Provider>
    );
};
