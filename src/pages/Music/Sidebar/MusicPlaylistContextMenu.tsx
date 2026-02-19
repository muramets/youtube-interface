// =============================================================================
// MUSIC PLAYLIST CONTEXT MENU
// =============================================================================
// Right-click context menu for playlist items in the sidebar.
// Actions: Rename, Move to Group, Delete.
// Portaled to body with backdrop to close.
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, FolderOpen, FolderPlus } from 'lucide-react';
import type { MusicPlaylist } from '../../../core/types/musicPlaylist';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

interface MusicPlaylistContextMenuProps {
    playlist: MusicPlaylist;
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    existingGroups: string[];
    onStartRename: () => void;
}

export const MusicPlaylistContextMenu: React.FC<MusicPlaylistContextMenuProps> = ({
    playlist,
    isOpen,
    onClose,
    position,
    existingGroups,
    onStartRename,
}) => {
    const { deletePlaylist, updatePlaylist } = useMusicStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    const [showGroupSubmenu, setShowGroupSubmenu] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [showNewGroupInput, setShowNewGroupInput] = useState(false);
    const newGroupInputRef = useRef<HTMLInputElement>(null);
    const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSubmenuTimer = useCallback(() => {
        if (submenuTimerRef.current) {
            clearTimeout(submenuTimerRef.current);
            submenuTimerRef.current = null;
        }
    }, []);

    const startSubmenuCloseTimer = useCallback(() => {
        clearSubmenuTimer();
        submenuTimerRef.current = setTimeout(() => {
            setShowGroupSubmenu(false);
            setShowNewGroupInput(false);
        }, 150);
    }, [clearSubmenuTimer]);

    useEffect(() => {
        if (showNewGroupInput) {
            requestAnimationFrame(() => newGroupInputRef.current?.focus());
        }
    }, [showNewGroupInput]);

    // Reset submenu state when context menu closes — legitimate prop-driven reset
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isOpen) {
            setShowGroupSubmenu(false);
            setShowNewGroupInput(false);
            setNewGroupName('');
        }
    }, [isOpen]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleDelete = async () => {
        if (!userId || !channelId) return;
        await deletePlaylist(userId, channelId, playlist.id);
        onClose();
    };

    const handleMoveToGroup = async (group: string | undefined) => {
        if (!userId || !channelId) return;
        await updatePlaylist(userId, channelId, playlist.id, { group });
        onClose();
    };

    const handleCreateGroup = async () => {
        const trimmed = newGroupName.trim();
        if (!trimmed || !userId || !channelId) return;
        await updatePlaylist(userId, channelId, playlist.id, { group: trimmed });
        onClose();
    };

    if (!isOpen) return null;

    const menuStyle: React.CSSProperties = {
        left: position.x,
        top: position.y,
    };

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[299] cursor-default"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                onContextMenu={(e) => { e.preventDefault(); onClose(); }}
            />

            {/* Menu */}
            <div
                className="fixed z-popover bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[160px]"
                style={menuStyle}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Rename */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStartRename();
                        onClose();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer"
                >
                    <Pencil size={10} /> Rename
                </button>

                {/* Move to Group */}
                <div
                    className="relative"
                    onMouseEnter={() => { clearSubmenuTimer(); setShowGroupSubmenu(true); }}
                    onMouseLeave={startSubmenuCloseTimer}
                >
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer"
                    >
                        <FolderOpen size={10} />
                        <span className="flex-1">Move to group</span>
                        <span className="text-text-tertiary">›</span>
                    </button>

                    {/* Submenu */}
                    {showGroupSubmenu && (
                        <div
                            className="absolute left-full top-0 bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl min-w-[140px] animate-fade-in"
                            onMouseEnter={clearSubmenuTimer}
                            onMouseLeave={startSubmenuCloseTimer}
                        >
                            {/* No group option */}
                            <button
                                onClick={() => handleMoveToGroup(undefined)}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer ${!playlist.group ? 'text-indigo-400' : 'text-text-primary'
                                    }`}
                            >
                                No group
                            </button>

                            {/* Existing groups */}
                            {existingGroups.map(g => (
                                <button
                                    key={g}
                                    onClick={() => handleMoveToGroup(g)}
                                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer ${playlist.group === g ? 'text-indigo-400' : 'text-text-primary'
                                        }`}
                                >
                                    {g}
                                </button>
                            ))}

                            {/* Divider */}
                            {existingGroups.length > 0 && (
                                <div className="my-1 border-t border-white/5" />
                            )}

                            {/* New group */}
                            {showNewGroupInput ? (
                                <div className="px-2 py-1 flex items-center gap-1">
                                    <input
                                        ref={newGroupInputRef}
                                        type="text"
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleCreateGroup();
                                            if (e.key === 'Escape') setShowNewGroupInput(false);
                                        }}
                                        placeholder="Group name..."
                                        className="flex-1 px-2 py-1 bg-bg-primary border border-border rounded text-xs text-text-primary placeholder-text-tertiary outline-none focus:border-indigo-400/50 w-[100px]"
                                    />
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowNewGroupInput(true)}
                                    className="w-full text-left px-3 py-1.5 text-xs text-text-tertiary hover:text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer"
                                >
                                    <FolderPlus size={10} /> New group
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div className="my-1 border-t border-white/5" />

                {/* Delete */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDelete();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer"
                >
                    <Trash2 size={10} /> Delete
                </button>
            </div>
        </>,
        document.body
    );
};
