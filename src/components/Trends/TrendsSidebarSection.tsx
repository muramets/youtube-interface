import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { useTrendStore } from '../../stores/trendStore';
import { TrendService } from '../../services/trendService';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { AddChannelModal } from './AddChannelModal';
import { SidebarDivider } from '../Layout/Sidebar';

export const TrendsSidebarSection: React.FC<{ expanded: boolean }> = ({ expanded }) => {
    const { channels, isAddChannelModalOpen, setAddChannelModalOpen, selectedChannelId, setSelectedChannelId } = useTrendStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const navigate = useNavigate();
    const location = useLocation();

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

    if (!expanded) {
        return null;
    }

    return (
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
                                    <button
                                        onClick={(e) => handleToggleVisibility(e, channel.id, channel.isVisible)}
                                        className={`p-1 rounded-full transition-all ${channel.isVisible
                                            ? 'opacity-0 group-hover:opacity-100 text-text-secondary hover:bg-white/10'
                                            : 'opacity-100 text-text-tertiary'
                                            }`}
                                    >
                                        {channel.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <AddChannelModal
                isOpen={isAddChannelModalOpen}
                onClose={() => setAddChannelModalOpen(false)}
            />
        </div>
    );
};
