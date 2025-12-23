import React, { useEffect, useState } from 'react';
import { User, Plus } from 'lucide-react';
// ...
// const [loadingYT, setLoadingYT] = useState(false);
import { useChannelStore } from '../../core/stores/channelStore';
import { useTrendStore } from '../../core/stores/trendStore';
import { useChannels } from '../../core/hooks/useChannels';
import { useAuth } from '../../core/hooks/useAuth';
import { CreateChannelModal } from './CreateChannelModal';

interface ChannelSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface YouTubeChannel {
    id: string;
    snippet: {
        title: string;
        thumbnails: {
            default: { url: string };
        };
    };
}

export const ChannelSelectorModal: React.FC<ChannelSelectorModalProps> = ({ isOpen, onClose }) => {
    const { setCurrentChannel, addChannel, currentChannel } = useChannelStore();
    const {
        clearTrendsFilters,
        setSelectedChannelId,
        setVideos,
        setChannels,
        setNiches,
        setVideoNicheAssignments,
        setHiddenVideos
    } = useTrendStore();
    const { user } = useAuth();
    // Use TanStack Query hook for channels
    const { data: channels = [] } = useChannels(user?.uid || '');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [youtubeChannels, setYoutubeChannels] = useState<YouTubeChannel[]>([]);
    // const [loadingYT, setLoadingYT] = useState(false);

    useEffect(() => {
        const fetchYouTubeChannels = async () => {
            if (!isOpen || !user) return;

            const token = localStorage.getItem('google_access_token');
            if (!token) return;

            // setLoadingYT(true);
            try {
                const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.items) {
                        setYoutubeChannels(data.items);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch YouTube channels", error);
            } finally {
                // setLoadingYT(false);
            }
        };

        fetchYouTubeChannels();
    }, [isOpen, user]);



    if (!isOpen) return null;

    if (isCreateModalOpen) {
        return <CreateChannelModal isOpen={true} onClose={() => setIsCreateModalOpen(false)} />;
    }

    const handleSelect = (channelId: string) => {
        const channel = channels.find(c => c.id === channelId);
        if (channel && channel.id !== currentChannel?.id) {
            // Clear trends state when switching User Channels
            clearTrendsFilters();
            setSelectedChannelId(null);

            // Clear all data synchronously to prevent stale reads
            setVideos([]);
            setChannels([]);
            setNiches([]);
            setVideoNicheAssignments({});
            setHiddenVideos([]);

            setCurrentChannel(channel);
        }
        onClose();
    };

    const handleImport = async (ytChannel: YouTubeChannel) => {
        if (!user) return;
        // Check if already exists
        const existing = channels.find(c => c.name === ytChannel.snippet.title);
        if (existing) {
            handleSelect(existing.id);
        } else {
            await addChannel(user.uid, ytChannel.snippet.title, ytChannel.snippet.thumbnails.default.url);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
        >
            <div
                className="animate-scale-in-center bg-bg-secondary rounded-[28px] p-10 w-[600px] max-w-[95%] border border-border text-text-primary flex flex-row gap-10 shadow-2xl"
            >
                {/* Left Side: Title */}
                <div className="flex-1 flex flex-col justify-center">
                    <div className="mb-6">
                        <div className="w-10 h-10 bg-[#3ea6ff] rounded flex items-center justify-center mb-4">
                            {/* Placeholder logo */}
                            <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[10px] border-l-white"></div>
                        </div>
                        <h2 className="m-0 mb-4 text-[32px] font-normal leading-[1.2]">
                            Choose your account<br />or a brand account
                        </h2>
                        <p className="m-0 text-[#aaa] text-base">to continue to MyTube</p>
                    </div>
                </div>

                {/* Right Side: List */}
                <div className="flex-1 border-l border-border pl-10 flex flex-col gap-2 max-h-[400px] overflow-y-auto custom-scrollbar">

                    {/* Existing App Channels */}
                    {channels.map(channel => (
                        <div
                            key={channel.id}
                            onClick={() => handleSelect(channel.id)}
                            className="flex items-center gap-4 py-3 cursor-pointer border-b border-border hover:bg-hover-bg transition-colors"
                        >
                            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center overflow-hidden shrink-0">
                                {channel.avatar ? (
                                    <img src={channel.avatar} alt={channel.name} className="w-full h-full object-cover" />
                                ) : (
                                    <User size={20} className="text-white" />
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-base font-medium text-text-primary">{channel.name}</span>
                                <span className="text-xs text-text-secondary">MyTube • Existing</span>
                            </div>
                        </div>
                    ))}

                    {/* Fetched YouTube Channels */}
                    {youtubeChannels.map(ytChannel => {
                        // Don't show if already imported (by name match for simplicity)
                        if (channels.some(c => c.name === ytChannel.snippet.title)) return null;

                        return (
                            <div
                                key={ytChannel.id}
                                onClick={() => handleImport(ytChannel)}
                                className="flex items-center gap-4 py-3 cursor-pointer border-b border-border hover:bg-hover-bg transition-colors"
                            >
                                <div className="w-10 h-10 rounded-full bg-[#cc0000] flex items-center justify-center overflow-hidden shrink-0">
                                    <img src={ytChannel.snippet.thumbnails.default.url} alt={ytChannel.snippet.title} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-base font-medium text-text-primary">{ytChannel.snippet.title}</span>
                                    <span className="text-xs text-text-secondary">YouTube • Import</span>
                                </div>
                            </div>
                        );
                    })}

                    {/* Create New Option */}
                    <div
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-4 py-3 cursor-pointer text-text-secondary border-b border-border hover:bg-hover-bg transition-colors"
                    >
                        <div className="w-10 h-10 rounded-full bg-bg-primary flex items-center justify-center shrink-0">
                            <Plus size={20} className="text-text-primary" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-base font-medium text-text-primary">Add channel</span>
                            <span className="text-xs text-text-secondary">Create new</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
