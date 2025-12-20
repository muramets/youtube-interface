import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { useVideos } from '../../hooks/useVideos';
import { VideoEditLayout } from './VideoEditLayout';
import { Loader2 } from 'lucide-react';

export const VideoEditPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos, isLoading } = useVideos(user?.uid || '', currentChannel?.id || '');

    const video = videos.find(v => v.id === id);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-text-secondary" />
            </div>
        );
    }

    // Video not found
    if (!video) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <h1 className="text-2xl font-semibold text-text-primary">Video not found</h1>
                <p className="text-text-secondary">The video you're looking for doesn't exist.</p>
                <button
                    onClick={() => navigate('/')}
                    className="px-4 py-2 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition-colors"
                >
                    Go Home
                </button>
            </div>
        );
    }

    return <VideoEditLayout video={video} />;
};
