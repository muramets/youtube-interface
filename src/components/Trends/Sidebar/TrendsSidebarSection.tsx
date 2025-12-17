import React from 'react';
import { Plus, TrendingUp, Trash2, RefreshCw } from 'lucide-react';
import { TrendsChannelItem } from './TrendsChannelItem';
import { TrendsChannelSkeleton } from './TrendsChannelSkeleton';
import { SidebarDivider } from '../../Layout/Sidebar';
import { Dropdown } from '../../Shared/Dropdown';
import { ConfirmationModal } from '../../Shared/ConfirmationModal';
import { useTrendsSidebar } from './hooks/useTrendsSidebar';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendNicheItem } from './TrendNicheItem';
import type { TrendChannel } from '../../../types/trends';

export const TrendsSidebarSection: React.FC<{ expanded: boolean }> = ({ expanded }) => {
    const {
        channels,
        selectedChannelId,
        isOnTrendsPage,
        menuState,
        channelToDelete,
        isLoadingChannels,
        setMenuState,
        setChannelToDelete,
        setAddChannelModalOpen,
        handleTrendsClick,
        handleChannelClick,
        handleToggleVisibility,
        handleRemoveChannel,
        handleSyncChannel
    } = useTrendsSidebar();

    const { niches, activeNicheId, setActiveNicheId } = useTrendStore();

    const globalNiches = niches.filter(n => n.type === 'global');
    const getLocalNiches = (channelId: string) => niches.filter(n => n.type === 'local' && n.channelId === channelId);

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

                        {/* Global Niches */}
                        {globalNiches.length > 0 && (
                            <ul className="mb-3 space-y-0.5">
                                {globalNiches.map(niche => (
                                    <TrendNicheItem
                                        key={niche.id}
                                        niche={niche}
                                        isActive={activeNicheId === niche.id}
                                        onClick={setActiveNicheId}
                                    />
                                ))}
                            </ul>
                        )}

                        {/* Channel List */}
                        {isLoadingChannels ? (
                            <TrendsChannelSkeleton />
                        ) : channels.length === 0 ? (
                            <div className="text-text-tertiary text-xs px-2 py-1">
                                No channels tracked
                            </div>
                        ) : (
                            <ul className="space-y-0.5">
                                {channels.map((channel: TrendChannel) => (
                                    <TrendsChannelItem
                                        key={channel.id}
                                        channel={channel}
                                        isActive={isOnTrendsPage && selectedChannelId === channel.id}
                                        onChannelClick={handleChannelClick}
                                        onToggleVisibility={handleToggleVisibility}
                                        onOpenMenu={(e, channelId) => setMenuState({ anchorEl: e.currentTarget as HTMLElement, channelId })}
                                        niches={getLocalNiches(channel.id)}
                                        activeNicheId={activeNicheId}
                                        onNicheClick={setActiveNicheId}
                                    />
                                ))}
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
                                    const channel = channels.find((c: TrendChannel) => c.id === menuState.channelId);
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
