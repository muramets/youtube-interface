import React from 'react';
import { VideoGrid } from '../../features/Video/VideoGrid';
import { CategoryBar } from './components/CategoryBar';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';

export const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { isLoading } = useVideos(user?.uid || '', currentChannel?.id || '');

    return (
        <div className="h-full flex flex-col">
            <CategoryBar />
            <div className="flex-1 min-h-0 relative">
                <VideoGrid isLoading={isLoading} />
            </div>
        </div>
    );
};
