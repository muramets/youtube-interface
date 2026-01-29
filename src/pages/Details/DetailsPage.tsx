/**
 * DetailsPage - Entry point for video details/packaging page
 * 
 * Supports full deep linking via URL parameters:
 *   /video/:channelId/:videoId/details
 * 
 * This allows bookmarks and shared links to work on any device,
 * without relying on localStorage state.
 */

import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';
import { useChannels } from '../../core/hooks/useChannels';
import { DetailsLayout } from './DetailsLayout';
import { Loader2 } from 'lucide-react';

export const DetailsPage: React.FC = () => {
    // Extract both channelId and videoId from URL for full deep linking support
    const { channelId, videoId } = useParams<{ channelId: string; videoId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { setCurrentChannel } = useChannelStore();
    const channelsQuery = useChannels(user?.uid || '');
    const channels = React.useMemo(() => channelsQuery.data || [], [channelsQuery.data]);

    // Use channelId from URL for fetching videos (enables deep linking)
    const { videos, isLoading } = useVideos(user?.uid || '', channelId || '');

    // Auto-set currentChannel from URL if not already set or different
    // This ensures sidebar and other components sync with the URL
    useEffect(() => {
        if (channelId && channels.length > 0) {
            const urlChannel = channels.find((c: { id: string }) => c.id === channelId);
            if (urlChannel) {
                setCurrentChannel(urlChannel);
            }
        }
    }, [channelId, channels, setCurrentChannel]);

    const video = videos.find(v => v.id === videoId);

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

    return <DetailsLayout video={video} />;
};
