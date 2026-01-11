import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, ThumbsDown, Trophy, Heart, FolderPlus, ChevronDown } from 'lucide-react';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import type { TrafficNicheProperty } from '@/core/types/suggestedTrafficNiches';
import { generateNicheColor } from '@/core/stores/trendStore';
import { TrafficNicheItem } from './TrafficNicheItem';
import { FloatingDropdownPortal } from '@/components/Shared/FloatingDropdownPortal';

interface TrafficNicheSelectorProps {
    videoIds: string[]; // Selected videos to assign
    isOpen: boolean;
    openAbove?: boolean;
    onToggle: () => void;
    onClose: () => void;
    onSelectionClear?: () => void;
}

export const TrafficNicheSelector: React.FC<TrafficNicheSelectorProps> = ({
    videoIds,
    isOpen,
    openAbove = false,
    onToggle,
    onSelectionClear
}) => {
    const {
        niches,
        assignments,
        addTrafficNiche,
        assignVideoToTrafficNiche,
        removeVideoFromTrafficNiche
    } = useTrafficNicheStore();

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // Single input for search AND create
    const [inputValue, setInputValue] = useState('');
    const [selectedProperty, setSelectedProperty] = useState<TrafficNicheProperty | undefined>(undefined);

    // Active menu state for mutually exclusive item menus
    const [activeNicheMenuId, setActiveNicheMenuId] = useState<string | null>(null);

    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Keyboard navigation
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    // --- Derived Logic ---

    const isMultiSelect = videoIds.length > 1;

    // Determine what to display on the button
    const displayNiche = useMemo(() => {
        if (isMultiSelect) return null;
        const videoId = videoIds[0];
        if (!videoId) return null;

        // Find assignments for this single video
        const videoAssignments = assignments.filter(a => a.videoId === videoId);
        if (videoAssignments.length === 0) return null;

        // Sort by property priority or just pick first? 
        // Trends sorts by viewCount then addedAt. We don't have viewCount on niche easily here without join.
        // Let's just pick the first one for now or last added? 
        // Trends logic: sort by view count desc, then addedAt asc.
        // We will just pick the first found niche object.
        const assignedNicheIds = videoAssignments.map(a => a.nicheId);
        const assignedNiches = niches.filter(n => assignedNicheIds.includes(n.id));

        if (assignedNiches.length === 0) return null;
        return assignedNiches[0];
    }, [videoIds, assignments, niches, isMultiSelect]);

    // Assignments Map: nicheId -> 'all' | 'some' | 'none' for the selected videos
    const nicheStatusMap = useMemo(() => {
        const status: Record<string, 'all' | 'some' | 'none'> = {};

        niches.forEach(niche => {
            const relevantAssignments = assignments.filter(a => a.nicheId === niche.id);
            const assignedVidIds = relevantAssignments.map(a => a.videoId);
            const count = videoIds.filter(vidId => assignedVidIds.includes(vidId)).length;

            if (count === 0) status[niche.id] = 'none';
            else if (count === videoIds.length) status[niche.id] = 'all';
            else status[niche.id] = 'some';
        });

        return status;
    }, [niches, assignments, videoIds]);

    // Filter niches based on input
    const filteredNiches = useMemo(() => {
        if (!inputValue.trim()) return niches;

        const searchTerms = inputValue.toLowerCase().trim().split(/\s+/);
        return niches.filter(n => {
            const nameLower = n.name.toLowerCase();
            return searchTerms.every(term => nameLower.includes(term));
        });
    }, [niches, inputValue]);

    // Fast Create UI Logic
    const exactMatch = useMemo(() => {
        const trimmed = inputValue.trim();
        if (!trimmed) return null;
        return niches.find(n => n.name.toLowerCase() === trimmed.toLowerCase());
    }, [niches, inputValue]);

    const showCreateUI = inputValue.trim() && !exactMatch;

    // --- Effects ---

    // Auto-focus input when opening
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Reset state on close
    useEffect(() => {
        if (!isOpen) {
            setInputValue('');
            setSelectedProperty(undefined);
            setHighlightedIndex(-1);
            setActiveNicheMenuId(null);
        }
    }, [isOpen]);

    // Reset highlighted index when filter changes
    useEffect(() => {
        setHighlightedIndex(-1);
    }, [filteredNiches, inputValue]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const item = listRef.current.children[highlightedIndex]?.querySelector?.('div[role="button"]') || listRef.current.children[highlightedIndex] as HTMLElement;
            if (item) {
                item.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex]);

    // --- Handlers ---

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (!trimmed || !user || !currentChannel) return;

        try {
            const newId = crypto.randomUUID();
            const existingColors = niches.map(n => n.color);
            const newColor = generateNicheColor(existingColors);

            // Optimistic UI
            onToggle();
            onSelectionClear?.();

            await addTrafficNiche({
                id: newId,
                name: trimmed,
                channelId: currentChannel.id,
                property: selectedProperty,
                color: newColor
            }, user.uid, currentChannel.id);

            await Promise.all(videoIds.map(vidId =>
                assignVideoToTrafficNiche(vidId, newId, user.uid, currentChannel.id)
            ));

            setInputValue('');
            setSelectedProperty(undefined);

        } catch (error) {
            console.error("Failed to create niche:", error);
        }
    };

    const handleToggleAssignment = async (nicheId: string, currentStatus: 'all' | 'some' | 'none') => {
        if (!user || !currentChannel) return;

        const shouldAdd = currentStatus !== 'all';

        await Promise.all(videoIds.map(async (vidId) => {
            if (shouldAdd) {
                const assigned = assignments.some(a => a.videoId === vidId && a.nicheId === nicheId);
                if (!assigned) {
                    await assignVideoToTrafficNiche(vidId, nicheId, user.uid, currentChannel.id);
                }
            } else {
                await removeVideoFromTrafficNiche(vidId, nicheId, user.uid, currentChannel.id);
            }
        }));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, filteredNiches.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && filteredNiches[highlightedIndex]) {
                e.preventDefault();
                e.stopPropagation();
                const niche = filteredNiches[highlightedIndex];
                const status = nicheStatusMap[niche.id] || 'none';
                handleToggleAssignment(niche.id, status);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onToggle();
        }
    };

    return (
        <div className="relative">
            {/* Encapsulated Trigger Button */}
            <button
                ref={buttonRef}
                onClick={onToggle}
                className={`
                    relative flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap
                    before:absolute before:inset-[-8px] before:content-['']
                    ${displayNiche ? 'bg-white/10 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}
                    ${isOpen ? 'ring-1 ring-white/30' : ''}
                `}
                style={{ backgroundColor: displayNiche?.color ? `${displayNiche.color}20` : undefined }}
            >
                {displayNiche ? (
                    <>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: displayNiche.color }} />
                        <span className="truncate max-w-[120px]">{displayNiche.name}</span>
                        {/* Check assignment count if > 1 */}
                        {videoIds[0] && assignments.filter(a => a.videoId === videoIds[0]).length > 1 && (
                            <span className="text-[10px] text-text-secondary">
                                +{assignments.filter(a => a.videoId === videoIds[0]).length - 1}
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <FolderPlus size={16} />
                        {isMultiSelect ? 'Assign Niches' : 'Assign Niche'}
                    </>
                )}
                <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Portal Dropdown */}
            <FloatingDropdownPortal
                isOpen={isOpen}
                anchorRect={buttonRef.current?.getBoundingClientRect() || null}
                openAbove={openAbove}
                width={240}
            >
                <div data-portal-wrapper className="flex flex-col h-full min-h-0">
                    <div className="p-2 border-b border-white/10 bg-white/5">
                        <form onSubmit={handleCreateSubmit} className="relative flex flex-col gap-2">
                            <div className="relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search or create niche..."
                                    className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onClick={() => setActiveNicheMenuId(null)}
                                    onFocus={() => setActiveNicheMenuId(null)}
                                />
                                <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                            </div>

                            {showCreateUI && (
                                <div className="flex items-center justify-between px-1 gap-3">
                                    <div className="relative flex bg-white/5 rounded-full p-0.5 border border-white/10 backdrop-blur-sm">
                                        {/* Highlight Pill (Only visible if selected) */}
                                        <div
                                            className={`
                                                absolute top-0.5 h-[calc(100%-4px)] w-[calc(33.333%-2px)] rounded-full transition-all duration-300 ease-out shadow-sm
                                                ${!selectedProperty ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}
                                                ${selectedProperty === 'unrelated' ? 'bg-gradient-to-r from-stone-600 to-stone-700' : ''}
                                                ${selectedProperty === 'targeted' ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : ''}
                                                ${selectedProperty === 'desired' ? 'bg-gradient-to-r from-pink-500 to-pink-600 shadow-[0_0_15px_rgba(236,72,153,0.5)]' : ''}
                                            `}
                                            style={{
                                                left: selectedProperty === 'unrelated' ? '2px' :
                                                    selectedProperty === 'targeted' ? 'calc(33.333% + 1px)' :
                                                        'calc(66.666% + 2px)'
                                            }}
                                        />

                                        {/* Buttons */}
                                        <button
                                            type="button"
                                            onClick={() => setSelectedProperty('unrelated')}
                                            className={`relative z-10 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-all duration-200 
                                                ${selectedProperty === 'unrelated' ? 'text-white font-medium' : 'text-stone-400 hover:text-stone-300 hover:bg-white/5'}
                                                ${!selectedProperty ? 'grayscale brightness-75 hover:grayscale-0 hover:brightness-100' : ''}
                                            `}
                                            title="Unrelated"
                                        >
                                            <ThumbsDown size={9} className="flex-shrink-0" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedProperty('targeted')}
                                            className={`relative z-10 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-all duration-200 
                                                ${selectedProperty === 'targeted' ? 'text-black/80 font-bold' : 'text-white/40 hover:text-yellow-400 hover:drop-shadow-[0_0_5px_rgba(250,204,21,0.5)] hover:bg-white/5'}
                                                ${!selectedProperty ? 'grayscale brightness-75 hover:grayscale-0 hover:brightness-100' : ''}
                                            `}
                                            title="Targeted"
                                        >
                                            <Trophy size={9} className="flex-shrink-0" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedProperty('desired')}
                                            className={`relative z-10 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-all duration-200 
                                                ${selectedProperty === 'desired' ? 'text-white font-bold' : 'text-white/40 hover:text-pink-500 hover:bg-white/5'}
                                                ${!selectedProperty ? 'grayscale brightness-75 hover:grayscale-0 hover:brightness-100' : ''}
                                            `}
                                            title="Desired"
                                        >
                                            <Heart size={9} className="flex-shrink-0" />
                                        </button>
                                    </div>
                                    <button
                                        type="submit"
                                        className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 hover:text-blue-300 transition-all border border-blue-500/20"
                                    >
                                        Create
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>

                    <div ref={listRef} className="overflow-y-auto custom-scrollbar p-1 flex-1">
                        {filteredNiches.map((niche, index) => {
                            const status = nicheStatusMap[niche.id] || 'none';

                            return (
                                <TrafficNicheItem
                                    key={niche.id}
                                    niche={niche}
                                    status={status}
                                    isActive={activeNicheMenuId === niche.id}
                                    isHighlighted={index === highlightedIndex}
                                    onClick={() => handleToggleAssignment(niche.id, status)}
                                    onToggleMenu={() => setActiveNicheMenuId(current => current === niche.id ? null : niche.id)}
                                    onCloseMenu={() => setActiveNicheMenuId(null)}
                                />
                            );
                        })}
                        {filteredNiches.length === 0 && !inputValue && (
                            <div className="text-center py-3 text-xs text-text-tertiary">No niches found</div>
                        )}
                    </div>
                </div>
            </FloatingDropdownPortal>
        </div>
    );
};
