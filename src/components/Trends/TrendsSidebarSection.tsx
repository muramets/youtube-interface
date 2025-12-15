import React from 'react';
import { Plus, Eye, EyeOff, TrendingUp, MoreVertical, Trash2, RefreshCw } from 'lucide-react';
import { SidebarDivider } from '../Layout/Sidebar';
import { Dropdown } from '../Shared/Dropdown';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { useTrendsSidebar } from './hooks/useTrendsSidebar';

export const TrendsSidebarSection: React.FC<{ expanded: boolean }> = ({ expanded }) => {
    const {
        channels,
        selectedChannelId,
        isOnTrendsPage,
        menuState,
        channelToDelete,
        setMenuState,
        setChannelToDelete,
        setAddChannelModalOpen,
        handleTrendsClick,
        handleChannelClick,
        handleToggleVisibility,
        handleRemoveChannel,
        handleSyncChannel
    } = useTrendsSidebar();

    return (
        <>
            {expanded && (
                <div className="mt-2">
                    <SidebarDivider />
                    <div className="px-3 py-2">
                        {/* Trends Header - Clickable */}
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={handleTrendsClick}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    handleTrendsClick();
                                }
                            }}
                            className={`w-full flex items-center justify-between p-2 rounded-lg mb-2 transition-all duration-200 cursor-pointer ${isOnTrendsPage && selectedChannelId === null
                                ? 'bg-white/10 text-text-primary'
                                : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} />
                                <span className="text-sm font-medium">Trends</span>
                            </div>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setAddChannelModalOpen(true);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.stopPropagation();
                                        setAddChannelModalOpen(true);
                                    }
                                }}
                                className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                                title="Add channel"
                            >
                                <Plus size={14} />
                            </div>
                        </div>

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
                                                referrerPolicy="no-referrer"
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
