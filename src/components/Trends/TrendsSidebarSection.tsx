import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Eye, EyeOff, TrendingUp, MoreVertical, Trash2, RefreshCw } from 'lucide-react';
import { useTrendStore } from '../../stores/trendStore';
import { TrendService } from '../../services/trendService';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { SidebarDivider } from '../Layout/Sidebar';
import { Dropdown } from '../Shared/Dropdown';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { useSettings } from '../../hooks/useSettings';
import { useUIStore } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';
import type { TrendChannel } from '../../types/trends';

export const TrendsSidebarSection: React.FC<{ expanded: boolean }> = ({ expanded }) => {
    const { channels, selectedChannelId, setSelectedChannelId, setAddChannelModalOpen } = useTrendStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { generalSettings } = useSettings();
    const { showToast } = useUIStore();
    const { addNotification } = useNotificationStore();
    const navigate = useNavigate();
    const location = useLocation();

    const [menuState, setMenuState] = useState<{ anchorEl: HTMLElement | null, channelId: string | null }>({ anchorEl: null, channelId: null });
    const [channelToDelete, setChannelToDelete] = useState<TrendChannel | null>(null);

    const isOnTrendsPage = location.pathname === '/trends';

    const handleTrendsClick = () => {
        setSelectedChannelId(null);
        navigate('/trends');
    };

    const handleChannelClick = (channelId: string) => {
        setSelectedChannelId(channelId);
        navigate('/trends');
    };

    const handleToggleVisibility = async (e: React.MouseEvent, channelId: string, currentVisibility: boolean) => {
        e.stopPropagation();
        if (user && currentChannel) {
            await TrendService.toggleVisibility(user.uid, currentChannel.id, channelId, !currentVisibility);
        }
    };

    const handleRemoveChannel = async () => {
        if (user && currentChannel && channelToDelete) {
            await TrendService.removeTrendChannel(user.uid, currentChannel.id, channelToDelete.id);
            if (selectedChannelId === channelToDelete.id) {
                setSelectedChannelId(null);
                navigate('/trends');
            }
            setChannelToDelete(null);
        }
    };

    const handleSyncChannel = async () => {
        const channelId = menuState.channelId;
        setMenuState({ anchorEl: null, channelId: null });

        if (!user || !currentChannel || !channelId) return;

        const channel = channels.find(c => c.id === channelId);
        if (!channel) return;

        const apiKey = generalSettings?.apiKey || localStorage.getItem('youtube_api_key') || '';
        if (!apiKey) {
            showToast('API Key not found. Please set it in Settings.', 'error');
            return;
        }

        showToast(`Syncing videos for ${channel.title}...`, 'success');

        try {
            const { totalNewVideos, totalQuotaUsed } = await TrendService.syncChannelVideos(user.uid, currentChannel.id, channel, apiKey);

            const message = `Sync complete. Added ${totalNewVideos} new videos. Quota used: ${totalQuotaUsed}`;
            showToast(message, 'success');

            await addNotification({
                title: 'Channel Synced',
                message: `${message} for ${channel.title}`,
                type: 'success',
                meta: 'Quota',
            });
        } catch (error: any) {
            console.error('Sync failed:', error);
            showToast(`Sync failed: ${error.message}`, 'error');
        }
    };

    return (
        <>
            {expanded && (
                <div className="mt-2">
                    <SidebarDivider />
                    <div className="px-3 py-2">
                        {/* Trends Header - Clickable */}
                        <button
                            onClick={handleTrendsClick}
                            className={`w-full flex items-center justify-between p-2 rounded-lg mb-2 transition-all duration-200 ${isOnTrendsPage && selectedChannelId === null
                                ? 'bg-white/10 text-text-primary'
                                : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} />
                                <span className="text-sm font-medium">Trends</span>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setAddChannelModalOpen(true);
                                }}
                                className="p-1 hover:bg-white/10 rounded-full transition-colors"
                                title="Add channel"
                            >
                                <Plus size={14} />
                            </button>
                        </button>

                        {/* Channel List */}
                        {channels.length === 0 ? (
                            <div className="text-text-tertiary text-xs px-2 py-1">
                                No channels tracked
                            </div>
                        ) : (
                            <ul className="space-y-0.5">
                                {channels.map(channel => {
                                    const isActive = isOnTrendsPage && selectedChannelId === channel.id;

                                    return (
                                        <li
                                            key={channel.id}
                                            onClick={() => handleChannelClick(channel.id)}
                                            className={`flex items-center group cursor-pointer p-2 rounded-lg transition-all duration-200 ${isActive
                                                ? 'bg-white/10'
                                                : 'hover:bg-white/5'
                                                }`}
                                        >
                                            <img
                                                src={channel.avatarUrl}
                                                alt={channel.title}
                                                className={`w-6 h-6 rounded-full mr-3 ring-2 transition-all ${!channel.isVisible ? 'grayscale opacity-50' : ''
                                                    } ${isActive ? 'ring-white/30' : 'ring-transparent'}`}
                                            />
                                            <span className={`text-sm truncate flex-1 transition-colors ${isActive ? 'text-text-primary font-medium' : 'text-text-secondary'
                                                }`}>
                                                {channel.title}
                                            </span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => handleToggleVisibility(e, channel.id, channel.isVisible)}
                                                    className={`p-1 rounded-full transition-all ${channel.isVisible
                                                        ? 'text-text-secondary hover:bg-white/10'
                                                        : 'text-text-tertiary opacity-100' // Force opacity for consistency if hidden
                                                        }`}
                                                    title={channel.isVisible ? "Hide channel" : "Show channel"}
                                                >
                                                    {channel.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMenuState({ anchorEl: e.currentTarget, channelId: channel.id });
                                                    }}
                                                    className="p-1 text-text-secondary hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                                    title="More options"
                                                >
                                                    <MoreVertical size={14} />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <Dropdown
                        isOpen={!!menuState.anchorEl}
                        onClose={() => setMenuState({ anchorEl: null, channelId: null })}
                        anchorEl={menuState.anchorEl}
                        width={180}
                    >
                        <div className="p-1 space-y-0.5">
                            <button
                                onClick={handleSyncChannel}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                            >
                                <RefreshCw size={14} />
                                <span>Sync</span>
                            </button>
                            <button
                                onClick={() => {
                                    const channel = channels.find(c => c.id === menuState.channelId);
                                    if (channel) setChannelToDelete(channel);
                                    setMenuState({ anchorEl: null, channelId: null });
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                            >
                                <Trash2 size={14} />
                                <span>Remove channel</span>
                            </button>
                        </div>
                    </Dropdown>

                    <ConfirmationModal
                        isOpen={!!channelToDelete}
                        onClose={() => setChannelToDelete(null)}
                        onConfirm={handleRemoveChannel}
                        title="Remove Channel"
                        message={`Are you sure you want to remove "${channelToDelete?.title}"? This will delete all tracked data for this channel.`}
                        confirmLabel="Remove"
                    />

                </div>
            )}
        </>
    );
};
