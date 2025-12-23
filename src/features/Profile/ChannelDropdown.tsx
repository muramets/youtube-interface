import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, LogOut, Plus, Check, Settings, Target } from 'lucide-react';
import { useChannelStore } from '../../core/stores/channelStore';
import { useTrendStore } from '../../core/stores/trendStore';
import { useChannels } from '../../core/hooks/useChannels';
import { useSettings } from '../../core/hooks/useSettings';
import { type Channel } from '../../core/services/channelService';
import { useAuth } from '../../core/hooks/useAuth';
import { CreateChannelModal } from './CreateChannelModal';
import { EditChannelModal } from './EditChannelModal';
import { Dropdown } from '../../components/Shared/Dropdown';

/** Badge component for displaying a target niche with truncation and tooltip */
const TargetNicheBadge: React.FC<{ nicheName: string }> = ({ nicheName }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const badgeRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
        if (badgeRef.current) {
            const rect = badgeRef.current.getBoundingClientRect();
            setTooltipPos({ x: rect.left, y: rect.top - 4 });
        }
        setShowTooltip(true);
    };

    return (
        <div
            ref={badgeRef}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] max-w-[80px] cursor-default"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <Target size={8} className="shrink-0" />
            <span className="truncate">{nicheName}</span>
            {showTooltip && createPortal(
                <div
                    className="fixed z-[9999] px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl text-[10px] text-white whitespace-nowrap pointer-events-none animate-fade-in"
                    style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-100%)' }}
                >
                    {nicheName}
                </div>,
                document.body
            )}
        </div>
    );
};

interface ChannelDropdownProps {
    onClose: () => void;
    anchorEl: HTMLElement | null;
}

export const ChannelDropdown: React.FC<ChannelDropdownProps> = ({ onClose, anchorEl }) => {
    const { currentChannel, setCurrentChannel } = useChannelStore();
    const {
        niches,
        clearTrendsFilters,
        setSelectedChannelId,
        setVideos,
        setChannels,
        setNiches,
        setVideoNicheAssignments,
        setHiddenVideos
    } = useTrendStore();
    const { user, logout } = useAuth();
    const { generalSettings, updateGeneralSettings } = useSettings();

    // Use TanStack Query hook for channels
    const { data: channels = [] } = useChannels(user?.uid || '');

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
    const [menuView, setMenuView] = useState<'main' | 'appearance'>('main');

    // Get target niche names for a channel (from cached names or lookup for current channel)
    const getTargetNicheNames = (channel: Channel): string[] => {
        // Use cached names if available (works across all channels)
        if (channel.targetNicheNames && channel.targetNicheNames.length > 0) {
            return channel.targetNicheNames.slice(0, 2);
        }
        // Fallback: lookup from niches (only works for current channel)
        if (!channel.targetNicheIds || channel.targetNicheIds.length === 0) return [];
        if (channel.id !== currentChannel?.id) return []; // Can't lookup other channel's niches
        return channel.targetNicheIds
            .slice(0, 2)
            .map(id => niches.find(n => n.id === id)?.name)
            .filter((name): name is string => name !== undefined);
    };

    const handleSwitch = (channelId: string) => {
        const channel = channels.find(c => c.id === channelId);
        if (channel && channel.id !== currentChannel?.id) {
            // Clear trends state when switching User Channels
            // Trend data (niches, channels, assignments, videos) is scoped per userChannel
            clearTrendsFilters();
            setSelectedChannelId(null);

            // CRITICAL: Clear all data synchronously to prevent stale reads by TrendsPage
            // before the new subscription data arrives.
            setVideos([]);
            setChannels([]);
            setNiches([]);
            setVideoNicheAssignments({});
            setHiddenVideos([]);

            setCurrentChannel(channel);
        }
        onClose();
    };

    const handleLogout = async () => {
        await logout();
        onClose();
    };

    const handleThemeChange = (theme: 'light' | 'dark' | 'device') => {
        if (user && currentChannel) {
            updateGeneralSettings(user.uid, currentChannel.id, { theme });
        }
    };

    const getThemeLabel = () => {
        switch (generalSettings.theme) {
            case 'light': return 'Light theme';
            case 'dark': return 'Dark theme';
            case 'device': return 'Device theme';
            default: return 'Device theme';
        }
    };

    if (isCreateModalOpen) {
        return <CreateChannelModal isOpen={true} onClose={() => { setIsCreateModalOpen(false); onClose(); }} />;
    }

    if (editingChannel) {
        return <EditChannelModal isOpen={true} channel={editingChannel} onClose={() => { setEditingChannel(null); onClose(); }} />;
    }

    return (
        <Dropdown
            isOpen={Boolean(anchorEl)}
            onClose={() => {
                onClose();
                setTimeout(() => setMenuView('main'), 200); // Reset menu on close
            }}
            anchorEl={anchorEl}
            className="text-text-primary w-[300px]"
        >
            {menuView === 'main' ? (
                <>
                    {/* User Account Header */}
                    <div className="px-4 py-4 border-b border-border flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#333] flex items-center justify-center overflow-hidden shrink-0">
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
                            ) : (
                                <User size={24} color="white" />
                            )}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="font-bold text-text-primary truncate">{user?.displayName || 'Google User'}</span>
                            <span className="text-xs text-text-secondary truncate">{user?.email}</span>
                        </div>
                    </div>

                    {/* Channel List */}
                    <div className="py-2 max-h-[300px] overflow-y-auto border-b border-border">
                        <div className="px-4 pb-2 text-xs text-text-secondary font-bold">
                            Your Channels
                        </div>
                        {channels.map(channel => {
                            const targetNicheNames = getTargetNicheNames(channel);
                            return (
                                <div
                                    key={channel.id}
                                    className={`group px-4 py-2 flex items-center gap-3 cursor-pointer relative hover:bg-hover-bg ${currentChannel?.id === channel.id ? 'bg-hover-bg' : ''}`}
                                >
                                    <div
                                        className="flex items-center gap-3 flex-1 overflow-hidden"
                                        onClick={() => handleSwitch(channel.id)}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center overflow-hidden shrink-0">
                                            {channel.avatar ? (
                                                <img src={channel.avatar} alt={channel.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={16} color="white" />
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <span className="block text-text-primary truncate">{channel.name}</span>
                                            {/* Target Niche Badges */}
                                            {targetNicheNames.length > 0 && (
                                                <div className="flex gap-1 mt-0.5">
                                                    {targetNicheNames.map((name, idx) => (
                                                        <TargetNicheBadge key={idx} nicheName={name} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {currentChannel?.id === channel.id && <Check size={16} className="text-text-secondary shrink-0" />}
                                    </div>

                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingChannel(channel);
                                        }}
                                        className="p-1 rounded-full text-text-secondary flex items-center justify-center hover:bg-[#3f3f3f] hover:text-white transition-colors"
                                    >
                                        <Settings size={16} />
                                    </div>
                                </div>
                            );
                        })}

                        {/* Add Channel - Moved to bottom of list */}
                        <div
                            onClick={() => setIsCreateModalOpen(true)}
                            className="px-4 py-2 flex items-center gap-3 cursor-pointer text-text-primary hover:bg-hover-bg transition-colors mt-1"
                        >
                            <div className="w-8 h-8 flex items-center justify-center shrink-0">
                                <Plus size={20} />
                            </div>
                            <span>Add channel</span>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                        <div
                            onClick={() => setMenuView('appearance')}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer text-text-primary hover:bg-hover-bg transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 flex items-center justify-center">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" /></svg>
                                </div>
                                <span>Appearance: {getThemeLabel()}</span>
                            </div>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-text-secondary"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                        </div>

                        <div
                            onClick={handleLogout}
                            className="px-4 py-2.5 flex items-center gap-3 cursor-pointer text-text-primary hover:bg-hover-bg transition-colors"
                        >
                            <LogOut size={20} />
                            <span>Sign out</span>
                        </div>
                    </div>
                </>
            ) : (
                /* Appearance Submenu */
                <div className="pb-2">
                    <div className="px-4 py-3 flex items-center gap-2 border-b border-border mb-2">
                        <button
                            onClick={() => setMenuView('main')}
                            className="p-1 -ml-2 hover:bg-hover-bg rounded-full"
                        >
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                        </button>
                        <span className="text-base font-medium">Appearance</span>
                    </div>

                    <div className="px-4 py-2 text-xs text-text-secondary">
                        Setting applies to this browser only
                    </div>

                    {[
                        { id: 'device', label: 'Use device theme' },
                        { id: 'dark', label: 'Dark theme' },
                        { id: 'light', label: 'Light theme' }
                    ].map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleThemeChange(item.id as 'light' | 'dark' | 'device')}
                            className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-hover-bg transition-colors"
                        >
                            <div className="w-5 h-5 flex items-center justify-center">
                                {generalSettings.theme === item.id && <Check size={20} />}
                            </div>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </Dropdown>
    );
};
