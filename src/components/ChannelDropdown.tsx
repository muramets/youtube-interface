import React, { useState } from 'react';
import { User, LogOut, Plus, Check, Settings } from 'lucide-react';
import { useChannelStore } from '../stores/channelStore';
import { useChannels } from '../hooks/useChannels';
import { useSettings } from '../hooks/useSettings';
import { type Channel } from '../services/channelService';
import { useAuth } from '../hooks/useAuth';
import { CreateChannelModal } from './Profile/CreateChannelModal';
import { EditChannelModal } from './Profile/EditChannelModal';
import { Dropdown } from './Shared/Dropdown';

interface ChannelDropdownProps {
    onClose: () => void;
    anchorEl: HTMLElement | null;
}

export const ChannelDropdown: React.FC<ChannelDropdownProps> = ({ onClose, anchorEl }) => {
    const { currentChannel, setCurrentChannel } = useChannelStore();
    const { user, logout } = useAuth();
    const { generalSettings, updateGeneralSettings } = useSettings();

    // Use TanStack Query hook for channels
    const { data: channels = [] } = useChannels(user?.uid || '');

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
    const [menuView, setMenuView] = useState<'main' | 'appearance'>('main');

    const handleSwitch = (channelId: string) => {
        const channel = channels.find(c => c.id === channelId);
        if (channel) {
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
                        {channels.map(channel => (
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
                                    <span className="flex-1 text-text-primary truncate">{channel.name}</span>
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
                        ))}

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
