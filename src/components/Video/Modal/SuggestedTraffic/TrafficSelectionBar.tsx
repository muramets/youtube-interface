import React, { useState, useRef, useEffect } from 'react';
import { FolderPlus, Plus, X, ChevronDown, Check, Home, ListVideo } from 'lucide-react';
import type { TrafficGroup } from '../../../../types/traffic';
import type { Playlist } from '../../../../services/playlistService';

interface TrafficSelectionBarProps {
    selectedCount: number;
    groups: TrafficGroup[];
    selectedGroupIds?: Set<string>;
    onAddToGroup: (groupId: string) => void;
    onCreateGroup: (name: string) => void;
    onClearSelection: () => void;
    onRemoveFromGroup?: () => void;
    activeGroupId?: string;
    playlists?: Playlist[];
    onAddToHome?: () => void;
    onAddToPlaylist?: (playlistId: string) => void;
    onCreatePlaylist?: (name: string) => void;
    isProcessing?: boolean;
}

export const TrafficSelectionBar: React.FC<TrafficSelectionBarProps> = ({
    selectedCount,
    groups,
    selectedGroupIds,
    onAddToGroup,
    onCreateGroup,
    onClearSelection,
    onRemoveFromGroup,
    activeGroupId,
    playlists = [],
    onAddToHome,
    onAddToPlaylist,
    onCreatePlaylist,
    isProcessing = false
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const playlistDropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const playlistInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (playlistDropdownRef.current && !playlistDropdownRef.current.contains(event.target as Node)) {
                setIsPlaylistDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('click', handleClickOutside, true);
            // Focus input when dropdown opens
            setTimeout(() => inputRef.current?.focus(), 50);
        }

        if (isPlaylistDropdownOpen) {
            document.addEventListener('click', handleClickOutside, true);
            // Focus input when dropdown opens
            setTimeout(() => playlistInputRef.current?.focus(), 50);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside, true);
        };
    }, [isDropdownOpen]);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newGroupName.trim()) {
            onCreateGroup(newGroupName.trim());
            setNewGroupName('');
            setIsDropdownOpen(false);
        }
    };

    const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPlaylistName.trim() && onCreatePlaylist) {
            onCreatePlaylist(newPlaylistName.trim());
            setNewPlaylistName('');
            setIsPlaylistDropdownOpen(false);
        }
    };

    if (selectedCount === 0) return null;

    return (
        <div className="absolute bottom-6 left-0 right-0 mx-auto w-fit z-50 animate-scale-in">
            <div className="flex items-center gap-2 bg-[#1F1F1F] border border-white/10 shadow-2xl rounded-full px-4 py-2">
                <div className="flex items-center gap-3 pr-3 border-r border-white/10">
                    <span className="text-sm font-medium text-white whitespace-nowrap">
                        {selectedCount} selected
                    </span>
                    <button
                        onClick={onClearSelection}
                        className="text-text-secondary hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Assign Niche Dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${isDropdownOpen ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'}
                        `}
                    >
                        <FolderPlus size={16} />
                        Assign Niche
                        <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? '' : 'rotate-180'}`} />
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1F1F1F] border border-white/10 rounded-xl shadow-xl overflow-hidden flex flex-col animate-fade-in z-[60]">
                            {/* Quick Create Input */}
                            <div className="p-2 border-b border-white/10">
                                <form onSubmit={handleCreateSubmit} className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Create new niche..."
                                        className="w-full bg-white/5 text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:bg-white/10 placeholder:text-text-secondary"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                    />
                                    <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                                </form>
                            </div>

                            {/* Groups List */}
                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                {groups.length === 0 ? (
                                    <div className="px-4 py-3 text-center text-xs text-text-secondary">
                                        No niches yet
                                    </div>
                                ) : (
                                    groups.map(group => (
                                        <button
                                            key={group.id}
                                            onClick={() => {
                                                onAddToGroup(group.id);
                                                setIsDropdownOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors group"
                                        >
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                                            <span className="truncate flex-1">{group.name}</span>
                                            {selectedGroupIds?.has(group.id) && <Check size={12} className="text-white" />}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-white/10 mx-1" />

                {/* Add to Home Button */}
                {onAddToHome && (
                    <button
                        onClick={onAddToHome}
                        disabled={isProcessing}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 text-white transition-all whitespace-nowrap ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/20'}`}
                        title="Add to Home Page"
                    >
                        <Home size={16} />
                        Add to Home
                    </button>
                )}

                {/* Add to Playlist Dropdown */}
                {onAddToPlaylist && (
                    <div className="relative" ref={playlistDropdownRef}>
                        <button
                            onClick={() => setIsPlaylistDropdownOpen(!isPlaylistDropdownOpen)}
                            disabled={isProcessing}
                            className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${isPlaylistDropdownOpen ? 'bg-white text-black' : isProcessing ? 'bg-white/10 text-white opacity-50 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-white'}
                        `}
                        >
                            <ListVideo size={16} />
                            Add to Playlist
                            <ChevronDown size={14} className={`transition-transform ${isPlaylistDropdownOpen ? '' : 'rotate-180'}`} />
                        </button>

                        {isPlaylistDropdownOpen && (
                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1F1F1F] border border-white/10 rounded-xl shadow-xl overflow-hidden flex flex-col animate-fade-in z-[60]">
                                <div className="px-4 py-2 border-b border-white/10 text-[10px] text-text-secondary uppercase font-bold tracking-wider">
                                    Select Playlist
                                </div>

                                {/* Quick Create Playlist Input */}
                                {onCreatePlaylist && (
                                    <div className="p-2 border-b border-white/10">
                                        <form onSubmit={handleCreatePlaylistSubmit} className="relative">
                                            <input
                                                ref={playlistInputRef}
                                                type="text"
                                                placeholder="Create new playlist..."
                                                className="w-full bg-white/5 text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:bg-white/10 placeholder:text-text-secondary"
                                                value={newPlaylistName}
                                                onChange={(e) => setNewPlaylistName(e.target.value)}
                                            />
                                            <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                                        </form>
                                    </div>
                                )}

                                <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                    {playlists.length === 0 ? (
                                        <div className="px-4 py-3 text-center text-xs text-text-secondary">
                                            No playlists found
                                        </div>
                                    ) : (
                                        playlists.map(playlist => (
                                            <button
                                                key={playlist.id}
                                                onClick={() => {
                                                    onAddToPlaylist(playlist.id);
                                                    setIsPlaylistDropdownOpen(false);
                                                }}
                                                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors group"
                                            >
                                                <div className="w-8 h-8 rounded bg-white/5 flex-shrink-0 flex items-center justify-center text-white/20">
                                                    <ListVideo size={14} />
                                                </div>
                                                <span className="truncate flex-1 font-medium">{playlist.name}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeGroupId && onRemoveFromGroup && (
                    <button
                        onClick={onRemoveFromGroup}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-medium rounded-full transition-colors whitespace-nowrap"
                    >
                        Remove from Niche
                    </button>
                )}
            </div>
        </div>
    );
};
