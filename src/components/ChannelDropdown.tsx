import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, LogOut, Plus, Check, Settings } from 'lucide-react';
import { useChannel, type Channel } from '../context/ChannelContext';
import { useAuth } from '../context/AuthContext';
import { CreateChannelModal } from './Profile/CreateChannelModal';
import { EditChannelModal } from './Profile/EditChannelModal';

interface ChannelDropdownProps {
    onClose: () => void;
    anchorEl: HTMLElement | null;
}

export const ChannelDropdown: React.FC<ChannelDropdownProps> = ({ onClose, anchorEl }) => {
    const { channels, currentChannel, switchChannel } = useChannel();
    const { user, logout } = useAuth();
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

    useEffect(() => {
        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            const menuWidth = 300;

            let top = rect.bottom + 8;
            let left = rect.right - menuWidth;

            if (left < 16) left = 16;

            setPosition({ top, left });
        }
    }, [anchorEl]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isCreateModalOpen || editingChannel) return;

            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && anchorEl && !anchorEl.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('resize', onClose);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose, anchorEl, isCreateModalOpen, editingChannel]);

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

    return createPortal(
        <div
            ref={dropdownRef}
            className="animate-scale-in"
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: '300px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                zIndex: 1000,
                overflow: 'hidden',
                padding: '8px 0'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* User Account Header (Google Account) */}
            <div
                style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}
            >
                <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                }}>
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <User size={24} color="white" />
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{user?.displayName || 'Google User'}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{user?.email}</span>
                </div>
            </div>

            {/* Channel List */}
            <div style={{ padding: '8px 0', maxHeight: '300px', overflowY: 'auto' }}>
                <div style={{ padding: '0 16px 8px 16px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                    Your Channels
                </div>
                {channels.map(channel => (
                    <div
                        key={channel.id}
                        className="group"
                        style={{
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            cursor: 'pointer',
                            backgroundColor: currentChannel?.id === channel.id ? 'var(--hover-bg)' : 'transparent',
                            position: 'relative'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = currentChannel?.id === channel.id ? 'var(--hover-bg)' : 'transparent'}
                    >
                        {/* Click area for switching */}
                        <div
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}
                            onClick={() => handleSwitch(channel.id)}
                        >
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'purple',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                            }}>
                                {channel.avatar ? (
                                    <img src={channel.avatar} alt={channel.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <User size={16} color="white" />
                                )}
                            </div>
                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{channel.name}</span>
                            {currentChannel?.id === channel.id && <Check size={16} color="var(--text-secondary)" />}
                        </div>

                        {/* Settings Icon (Only visible on hover or if active?) - Let's make it always visible or hover */}
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingChannel(channel);
                            }}
                            style={{
                                padding: '4px',
                                borderRadius: '50%',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            className="hover:bg-[#3f3f3f] hover:text-white"
                        >
                            <Settings size={16} />
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <div
                    onClick={() => setIsCreateModalOpen(true)}
                    style={{
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <Plus size={20} />
                    <span>Add channel</span>
                </div>
                <div
                    onClick={handleLogout}
                    style={{
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <LogOut size={20} />
                    <span>Sign out</span>
                </div>
            </div>
        </div>,
        document.body
    );
};
