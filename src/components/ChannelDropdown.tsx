import React, { useState } from 'react';
import { User, LogOut, Plus, Check, Settings } from 'lucide-react';
import { useChannel, type Channel } from '../context/ChannelContext';
import { useAuth } from '../context/AuthContext';
import { CreateChannelModal } from './Profile/CreateChannelModal';
import { EditChannelModal } from './Profile/EditChannelModal';
import { Dropdown } from './Shared/Dropdown';

interface ChannelDropdownProps {
    onClose: () => void;
    anchorEl: HTMLElement | null;
}

export const ChannelDropdown: React.FC<ChannelDropdownProps> = ({ onClose, anchorEl }) => {
    const { channels, currentChannel, switchChannel } = useChannel();
    const { user, logout } = useAuth();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

    const handleSwitch = (channelId: string) => {
        switchChannel(channelId);
        onClose();
    };

    const handleLogout = async () => {
        await logout();
        onClose();
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
            onClose={onClose}
            anchorEl={anchorEl}
            className="text-text-primary"
        >
            {/* User Account Header (Google Account) */}
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
            <div className="py-2 max-h-[300px] overflow-y-auto">
                <div className="px-4 pb-2 text-xs text-text-secondary font-bold">
                    Your Channels
                </div>
                {channels.map(channel => (
                    <div
                        key={channel.id}
                        className={`group px-4 py-2 flex items-center gap-3 cursor-pointer relative hover:bg-hover-bg ${currentChannel?.id === channel.id ? 'bg-hover-bg' : ''}`}
                    >
                        {/* Click area for switching */}
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

                        {/* Settings Icon */}
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
            </div>

            <div className="border-t border-border pt-2">
                <div
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2.5 flex items-center gap-3 cursor-pointer text-text-primary hover:bg-hover-bg transition-colors"
                >
                    <Plus size={20} />
                    <span>Add channel</span>
                </div>
                <div
                    onClick={handleLogout}
                    className="px-4 py-2.5 flex items-center gap-3 cursor-pointer text-text-primary hover:bg-hover-bg transition-colors"
                >
                    <LogOut size={20} />
                    <span>Sign out</span>
                </div>
            </div>
        </Dropdown>
    );
};
