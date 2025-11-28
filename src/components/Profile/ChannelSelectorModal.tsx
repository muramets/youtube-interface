import React, { useEffect, useState } from 'react';
import { User, Plus } from 'lucide-react';
// ...
// const [loadingYT, setLoadingYT] = useState(false);
import { useChannel } from '../../context/ChannelContext';
import { useAuth } from '../../context/AuthContext';
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
    const { channels, switchChannel, createChannel } = useChannel();
    const { user } = useAuth();
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
        switchChannel(channelId);
        onClose();
    };

    const handleImport = async (ytChannel: YouTubeChannel) => {
        // Check if already exists
        const existing = channels.find(c => c.name === ytChannel.snippet.title);
        if (existing) {
            handleSelect(existing.id);
        } else {
            await createChannel(ytChannel.snippet.title); // We should ideally pass avatar too
            // createChannel currently only takes name. We might need to update it to take avatar.
        }
    };

    return (
        <div
            className="animate-fade-in"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.9)', // Darker background as per screenshot
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000
            }}
        >
            <div
                className="animate-scale-in-center"
                style={{
                    backgroundColor: '#1f1f1f', // Dark card background
                    borderRadius: '28px', // More rounded
                    padding: '40px',
                    width: '600px', // Wider
                    maxWidth: '95%',
                    border: '1px solid #333',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'row', // Side by side layout
                    gap: '40px',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.5)'
                }}
            >
                {/* Left Side: Title */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{
                            width: '40px', height: '40px', backgroundColor: '#3ea6ff', borderRadius: '4px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px'
                        }}>
                            {/* Placeholder logo */}
                            <div style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid white' }}></div>
                        </div>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '32px', fontWeight: '400', lineHeight: '1.2' }}>
                            Choose your account<br />or a brand account
                        </h2>
                        <p style={{ margin: 0, color: '#aaa', fontSize: '16px' }}>to continue to MyTube</p>
                    </div>
                </div>

                {/* Right Side: List */}
                <div style={{ flex: 1, borderLeft: '1px solid #333', paddingLeft: '40px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>

                    {/* Existing App Channels */}
                    {channels.map(channel => (
                        <div
                            key={channel.id}
                            onClick={() => handleSelect(channel.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                padding: '12px 0',
                                cursor: 'pointer',
                                borderBottom: '1px solid #333'
                            }}
                        >
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'purple',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                            }}>
                                {channel.avatar ? (
                                    <img src={channel.avatar} alt={channel.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <User size={20} color="white" />
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '16px', fontWeight: '500' }}>{channel.name}</span>
                                <span style={{ fontSize: '12px', color: '#aaa' }}>MyTube • Existing</span>
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
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    padding: '12px 0',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #333'
                                }}
                            >
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#cc0000',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                                }}>
                                    <img src={ytChannel.snippet.thumbnails.default.url} alt={ytChannel.snippet.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '16px', fontWeight: '500' }}>{ytChannel.snippet.title}</span>
                                    <span style={{ fontSize: '12px', color: '#aaa' }}>YouTube • Import</span>
                                </div>
                            </div>
                        );
                    })}

                    {/* Create New Option */}
                    <div
                        onClick={() => setIsCreateModalOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            padding: '12px 0',
                            cursor: 'pointer',
                            color: '#aaa',
                            borderBottom: '1px solid #333'
                        }}
                    >
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#333',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Plus size={20} color="white" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '16px', fontWeight: '500', color: 'white' }}>Add channel</span>
                            <span style={{ fontSize: '12px', color: '#aaa' }}>Create new</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
