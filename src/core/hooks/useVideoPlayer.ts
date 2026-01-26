import { useContext } from 'react';
import { VideoPlayerContext } from '../contexts/VideoPlayerContext';

export const useVideoPlayer = () => {
    const context = useContext(VideoPlayerContext);
    if (!context) {
        throw new Error('useVideoPlayer must be used within a VideoPlayerProvider');
    }
    return context;
};
