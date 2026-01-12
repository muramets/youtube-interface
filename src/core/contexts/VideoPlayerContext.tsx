import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface VideoPlayerState {
    activeVideoId: string | null;
    isMinimized: boolean;
    videoTitle?: string; // Optional title for the mini player
}

interface VideoPlayerContextType extends VideoPlayerState {
    minimize: (videoId: string, title?: string) => void;
    close: () => void;
    maximize: () => void; // Potential future use, or just to un-minimize if we had a full modal
}

const VideoPlayerContext = createContext<VideoPlayerContextType | null>(null);

export const VideoPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<VideoPlayerState>({
        activeVideoId: null,
        isMinimized: false,
        videoTitle: undefined
    });

    const minimize = useCallback((videoId: string, title?: string) => {
        setState({
            activeVideoId: videoId,
            isMinimized: true,
            videoTitle: title
        });
    }, []);

    const close = useCallback(() => {
        setState({
            activeVideoId: null,
            isMinimized: false,
            videoTitle: undefined
        });
    }, []);

    const maximize = useCallback(() => {
        // For now, this effectively closes the mini-player as we don't have a "maximized" modal mode 
        // distinct from the tooltip (which is ephemeral). 
        // In the future this could open a full mock-modal.
        setState(prev => ({ ...prev, isMinimized: false }));
    }, []);

    const value = useMemo(() => ({
        ...state,
        minimize,
        close,
        maximize
    }), [state, minimize, close, maximize]);

    return (
        <VideoPlayerContext.Provider value={value}>
            {children}
        </VideoPlayerContext.Provider>
    );
};

export const useVideoPlayer = () => {
    const context = useContext(VideoPlayerContext);
    if (!context) {
        throw new Error('useVideoPlayer must be used within a VideoPlayerProvider');
    }
    return context;
};
