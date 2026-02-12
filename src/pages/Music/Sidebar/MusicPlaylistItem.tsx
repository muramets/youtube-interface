// =============================================================================
// MUSIC SIDEBAR: Playlist Item
// =============================================================================
// Sidebar item for a single music playlist, styled like TrendNicheItem.
// Features: color circle with color picker, text truncation with fade,
// MoreVertical context menu trigger, inline rename, and DnD drop target.
// =============================================================================

import React, { useRef, useState, useEffect, useCallback } from 'react';

import { useDroppable } from '@dnd-kit/core';
import { Heart, MoreVertical, Check } from 'lucide-react';
import { MusicPlaylistContextMenu } from './MusicPlaylistContextMenu';
import type { MusicPlaylist } from '../../../core/types/musicPlaylist';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { MANUAL_NICHE_PALETTE } from '../../../core/stores/trendStore';

interface MusicPlaylistItemProps {
    id: string;
    name: string;
    trackCount: number;
    isActive: boolean;
    onClick: () => void;
    icon?: 'heart' | 'playlist';
    color?: string;
    indent?: boolean;
    droppable?: boolean;
    playlist?: MusicPlaylist;
    existingGroups?: string[];
}

export const MusicPlaylistItem: React.FC<MusicPlaylistItemProps> = ({
    id,
    name,
    trackCount,
    isActive,
    onClick,
    icon = 'playlist',
    color,
    droppable = true,
    playlist,
    existingGroups = [],
}) => {
    const nameRef = useRef<HTMLSpanElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    // UI state
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(name);

    const { updatePlaylist } = useMusicStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const PRESET_COLORS = MANUAL_NICHE_PALETTE;

    // DnD: Make this playlist a drop target
    const { setNodeRef, isOver } = useDroppable({
        id: `playlist-drop-${id}`,
        data: { type: 'music-playlist', playlistId: id },
        disabled: !droppable || icon === 'heart',
    });

    const isDragTarget = isOver && droppable && icon !== 'heart';
    const isInteracting = isMenuOpen || isColorPickerOpen;

    // Detect text truncation
    useEffect(() => {
        const el = nameRef.current;
        if (!el) return;
        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [name]);

    // Close color picker on outside click
    useEffect(() => {
        if (!isColorPickerOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
                setIsColorPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isColorPickerOpen]);

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleNameSubmit = useCallback(() => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== name && user?.uid && currentChannel?.id) {
            updatePlaylist(user.uid, currentChannel.id, id, { name: trimmed });
        }
        setIsEditing(false);
    }, [editName, name, id, user, currentChannel, updatePlaylist]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleNameSubmit();
        }
        if (e.key === 'Escape') {
            setEditName(name);
            setIsEditing(false);
        }
    }, [handleNameSubmit, name]);

    const handleColorChange = useCallback((newColor: string) => {
        if (!user?.uid || !currentChannel?.id) return;
        updatePlaylist(user.uid, currentChannel.id, id, { color: newColor });
        setIsColorPickerOpen(false);
    }, [id, user, currentChannel, updatePlaylist]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (icon === 'heart') return;
        e.preventDefault();
        e.stopPropagation();
        setMenuPosition({ x: e.clientX, y: e.clientY });
        setIsMenuOpen(true);
        setIsColorPickerOpen(false);
    }, [icon]);

    // Default color for playlists without one
    const displayColor = color || '#6366f1';

    return (
        <>
            <div
                ref={setNodeRef}
                className={`relative group/playlist ml-4 ${isDragTarget ? 'z-[10001]' : isInteracting ? 'z-20' : ''}`}
            >
                <div
                    onClick={() => !isEditing && onClick()}
                    onContextMenu={handleContextMenu}
                    className={`
                        flex items-center pl-3 pr-2 py-2 cursor-pointer transition-all rounded-lg
                        ${isDragTarget
                            ? 'bg-white/20 text-white'
                            : isActive
                                ? 'bg-white/10 text-white'
                                : isInteracting
                                    ? 'bg-white/5 text-white'
                                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                        }
                    `}
                >
                    {/* Color Circle / Heart Icon */}
                    <div className="mr-3 shrink-0 flex items-center justify-center w-6 h-6">
                        {icon === 'heart' ? (
                            <Heart
                                size={14}
                                className={isActive ? 'text-red-400 fill-red-400' : 'text-red-400/60'}
                            />
                        ) : (
                            <div ref={colorPickerRef} className="relative flex items-center justify-center">
                                <div
                                    role="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsColorPickerOpen(!isColorPickerOpen);
                                        setIsMenuOpen(false);
                                    }}
                                    className="w-3.5 h-3.5 rounded-full transition-all hover:scale-125 hover:ring-2 hover:ring-white/20 cursor-pointer"
                                    style={{ backgroundColor: displayColor }}
                                />

                                {/* Color Picker Dropdown */}
                                {isColorPickerOpen && (
                                    <div
                                        className="absolute left-0 top-6 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-fade-in"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div
                                            className="grid gap-2"
                                            style={{ gridTemplateColumns: 'repeat(5, min-content)' }}
                                        >
                                            {PRESET_COLORS.map(c => (
                                                <button
                                                    key={c}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleColorChange(c);
                                                    }}
                                                    className="w-6 h-6 rounded-full transition-shadow relative hover:ring-2 hover:ring-white/50 ring-offset-1 ring-offset-[#1a1a1a] border-none cursor-pointer"
                                                    style={{ backgroundColor: c }}
                                                >
                                                    {displayColor === c && (
                                                        <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow-sm" strokeWidth={3} />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Name (editable or text) */}
                    <div className="flex-1 min-w-0 relative flex items-center">
                        <span
                            ref={nameRef}
                            className={`text-xs overflow-hidden whitespace-nowrap transition-colors leading-none translate-y-[-1px] ${isEditing ? 'opacity-0' : ''}`}
                            style={isTruncated ? {
                                maskImage: 'linear-gradient(to right, black 50%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to right, black 50%, transparent 100%)',
                            } : undefined}
                        >
                            {name}
                        </span>
                        {isEditing && icon !== 'heart' && (
                            <input
                                ref={inputRef}
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={handleNameSubmit}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute inset-y-0 left-0 right-0 text-xs bg-[#1a1a1a] border-0 border-b border-white/40 outline-none text-white z-10"
                            />
                        )}
                    </div>

                    {/* Track Count / MoreVertical — swap on hover */}
                    <div className="ml-2 flex items-center justify-center shrink-0 w-4">
                        {/* Track count — visible by default, hidden on hover */}
                        <span className={`text-[10px] text-text-tertiary leading-none ${isInteracting ? 'hidden' : 'group-hover/playlist:hidden'}`}>
                            {trackCount}
                        </span>

                        {/* MoreVertical — hidden by default, visible on hover (replaces count) */}
                        {icon !== 'heart' && (
                            <button
                                ref={menuButtonRef}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isMenuOpen) {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setMenuPosition({ x: rect.right + 5, y: rect.top });
                                    }
                                    setIsMenuOpen(!isMenuOpen);
                                    setIsColorPickerOpen(false);
                                }}
                                className={`
                                    hover:text-white transition-colors border-none bg-transparent cursor-pointer p-0 leading-none
                                    ${isInteracting ? 'flex text-white' : 'hidden text-text-tertiary group-hover/playlist:flex'}
                                    relative after:absolute after:-inset-2 after:content-['']
                                `}
                            >
                                <MoreVertical size={10} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Context Menu */}
            {playlist && (
                <MusicPlaylistContextMenu
                    playlist={playlist}
                    isOpen={isMenuOpen}
                    onClose={() => setIsMenuOpen(false)}
                    position={menuPosition}
                    existingGroups={existingGroups}
                    onStartRename={() => {
                        setIsEditing(true);
                        setEditName(name);
                        setIsMenuOpen(false);
                    }}
                />
            )}
        </>
    );
};
