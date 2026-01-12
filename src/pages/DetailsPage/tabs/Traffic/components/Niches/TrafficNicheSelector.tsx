import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ThumbsDown, Trophy, Heart, FolderPlus, ChevronDown, GitBranch, Check, MoreVertical } from 'lucide-react';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import type { TrafficNicheProperty } from '@/core/types/suggestedTrafficNiches';
import { generateNicheColor } from '@/core/stores/trendStore';
import { TrafficNicheContextMenu } from './TrafficNicheContextMenu';
import { FloatingDropdownPortal } from '@/components/Shared/FloatingDropdownPortal';
import { NicheColorPickerGrid } from './NicheColorPickerGrid';

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
        updateTrafficNiche,
        deleteTrafficNiche,
        assignVideoToTrafficNiche,
        removeVideoFromTrafficNiche
    } = useTrafficNicheStore();

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // Single input for search AND create
    const [inputValue, setInputValue] = useState('');
    const [selectedProperty, setSelectedProperty] = useState<TrafficNicheProperty | undefined>(undefined);
    const [selectedColor, setSelectedColor] = useState<string>('#3B82F6'); // Default init
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    // Active menu state for mutually exclusive item menus
    const [activeNicheMenuId, setActiveNicheMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const pickerTriggerRef = useRef<HTMLButtonElement>(null);

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
        // 1. Calculate Last Used map
        const lastUsedMap = new Map<string, number>();
        assignments.forEach(a => {
            const current = lastUsedMap.get(a.nicheId) || 0;
            if (a.addedAt > current) {
                lastUsedMap.set(a.nicheId, a.addedAt);
            }
        });

        // 2. Sort all niches
        const sorted = [...niches].sort((a, b) => {
            const lastUsedA = lastUsedMap.get(a.id) || 0;
            const lastUsedB = lastUsedMap.get(b.id) || 0;

            if (lastUsedA !== lastUsedB) {
                return lastUsedB - lastUsedA; // Recent first
            }
            // Fallback to creation time
            return b.createdAt - a.createdAt;
        });

        // 3. Filter
        if (!inputValue.trim()) return sorted;

        const searchTerms = inputValue.toLowerCase().trim().split(/\s+/);
        return sorted.filter(n => {
            const nameLower = n.name.toLowerCase();
            return searchTerms.every(term => nameLower.includes(term));
        });
    }, [niches, inputValue, assignments]);

    // Fast Create UI Logic
    const exactMatch = useMemo(() => {
        const trimmed = inputValue.trim();
        if (!trimmed) return null;
        return niches.find(n => n.name.toLowerCase() === trimmed.toLowerCase());
    }, [niches, inputValue]);

    // Initial random color when showing Create UI
    useEffect(() => {
        if (inputValue.trim() && !exactMatch) {
            // Only set if we haven't manually picked one? 
            // Better: just set a random one once when invalid -> valid transition happens
            // Or just on mount? No.
            // Let's just rely on the user or default.
            // Actually, let's pick a random one on input start if not set.
            // But state persistence is tricky.
            // Let's just generate one when `showCreateUI` becomes true.
        }
    }, [inputValue, exactMatch]);

    const showCreateUI = inputValue.trim() && !exactMatch;

    // Better approach: when showCreateUI becomes true, set a random color if not already set or randomized recently.
    // For simplicity, let's just use a memoized random color or effect.
    useEffect(() => {
        if (showCreateUI) {
            const existingColors = niches.map(n => n.color);
            setSelectedColor(generateNicheColor(existingColors));
        }
    }, [showCreateUI]); // Reset when UI appears

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
            setIsColorPickerOpen(false);
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
            // Use selected color
            const newColor = selectedColor;

            await addTrafficNiche({
                id: newId,
                name: trimmed,
                channelId: currentChannel.id,
                // Only include property if defined (Firestore rejects undefined)
                ...(selectedProperty ? { property: selectedProperty } : {}),
                color: newColor
            }, user.uid, currentChannel.id);

            await Promise.all(videoIds.map(vidId =>
                assignVideoToTrafficNiche(vidId, newId, user.uid, currentChannel.id)
            ));

            // Close UI only AFTER success
            onToggle();
            onSelectionClear?.();
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
        if (filteredNiches.length === 0) return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            // INVERTED LOGIC: Arrow UP goes "visually up", which means deeper into the array (index increments)
            // Input -> Index 0 -> Index 1 -> ...
            setHighlightedIndex(prev => {
                const next = prev + 1;
                return next >= filteredNiches.length ? prev : next;
            });
        }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            // INVERTED LOGIC: Arrow DOWN goes "visually down", which means towards the input (index decrements)
            // Index 1 -> Index 0 -> Input (-1)
            setHighlightedIndex(prev => {
                const next = prev - 1;
                return next < -1 ? -1 : next;
            });
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0) {
                const niche = filteredNiches[highlightedIndex];
                if (niche) {
                    const status = nicheStatusMap[niche.id];
                    handleToggleAssignment(niche.id, status);
                }
            } else if (inputValue.trim()) {
                // Submit form if input has value (Create)
                handleCreateSubmit(e as any);
            }
        }
        else if (e.key === 'Escape') {
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
                    {/* List Section (Now First in DOM, taking remaining space) */}
                    {/* flex-col-reverse puts the first item (Index 0 - Most Recent) at the bottom, near the input */}
                    <div
                        ref={listRef}
                        className="flex-1 overflow-y-auto custom-scrollbar p-1 flex flex-col-reverse"
                    >
                        {filteredNiches.map((niche, index) => {
                            const status = nicheStatusMap[niche.id];
                            const isHighlighted = index === highlightedIndex;

                            // Helper for property icon
                            const getPropertyIcon = (prop?: TrafficNicheProperty) => {
                                switch (prop) {
                                    case 'unrelated': return <ThumbsDown size={12} className="text-stone-400" />;
                                    case 'adjacent': return <GitBranch size={12} className="text-purple-400" />;
                                    case 'targeted': return <Trophy size={12} className="text-yellow-400" />;
                                    case 'desired': return <Heart size={12} className="text-pink-500" />;
                                    default: return null;
                                }
                            };

                            return (
                                <div
                                    key={niche.id}
                                    role="button"
                                    onClick={() => handleToggleAssignment(niche.id, status)}
                                    // Use standard compact padding matching PlaylistSelector
                                    className={`
                                        group flex items-center justify-between px-3 py-2 text-xs rounded-lg cursor-pointer transition-all duration-200 shrink-0
                                        ${isHighlighted ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'}
                                    `}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {/* Color Dot */}
                                        <div
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: niche.color }}
                                        />

                                        {/* Property Icon */}
                                        {niche.property && (
                                            <div className="flex-shrink-0 opacity-80">
                                                {getPropertyIcon(niche.property)}
                                            </div>
                                        )}

                                        {/* Name */}
                                        <span className="truncate" title={niche.name}>
                                            {niche.name}
                                        </span>
                                    </div>

                                    {/* Actions / Status */}
                                    <div className="flex items-center gap-2 pl-2">
                                        {status === 'all' && <Check size={14} className="text-green-400" />}
                                        {status === 'some' && <div className="w-2 h-2 rounded-full bg-text-secondary" />}

                                        {/* Context Menu Trigger */}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setMenuPosition({ x: rect.left, y: rect.bottom });
                                                setActiveNicheMenuId(activeNicheMenuId === niche.id ? null : niche.id);
                                            }}
                                            className={`p-1 rounded-md text-text-tertiary hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all
                                                ${activeNicheMenuId === niche.id ? 'opacity-100 bg-white/10 text-white' : ''}
                                            `}
                                        >
                                            <MoreVertical size={12} />
                                        </button>

                                        {/* Dropdown Menu Portal */}
                                        {activeNicheMenuId === niche.id && (
                                            <TrafficNicheContextMenu
                                                niche={niche}
                                                isOpen={true}
                                                onClose={() => setActiveNicheMenuId(null)}
                                                position={menuPosition}
                                                onRename={() => { }}
                                                onDelete={() => {
                                                    deleteTrafficNiche(niche.id, user?.uid || '', currentChannel?.id || '');
                                                }}
                                                onUpdateProperty={(prop) => {
                                                    updateTrafficNiche(niche.id, { property: prop }, user?.uid || '', currentChannel?.id || '');
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {filteredNiches.length === 0 && (
                            <div className="p-4 text-center text-xs text-text-tertiary">
                                {inputValue ? 'Create new niche below...' : 'Start typing to create...'}
                            </div>
                        )}
                    </div>

                    {/* Input Section (Now at the Bottom) */}
                    <div className="p-2 border-t border-white/10 bg-white/5 shrink-0 z-10">
                        <form onSubmit={handleCreateSubmit} className="relative flex flex-col gap-2">
                            <div className="relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search or create niche..."
                                    className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    // Don't override handler, use the one defined in component which handles ArrowUp/Down
                                    onKeyDown={handleKeyDown}
                                    onClick={() => setActiveNicheMenuId(null)}
                                    onFocus={() => setActiveNicheMenuId(null)}
                                />
                                <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                            </div>

                            {showCreateUI && (
                                <div className="flex items-center gap-2 px-1 py-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                    {/* Property Switcher - Compact & Premium */}
                                    <div className="relative flex bg-white/5 rounded-full p-0.5 border border-white/10 backdrop-blur-sm h-6 flex-shrink-0">
                                        {/* Highlight Pill */}
                                        <div
                                            className={`
                                                absolute top-0.5 bottom-0.5 rounded-full transition-all duration-300 ease-out shadow-sm
                                                ${!selectedProperty ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}
                                                ${selectedProperty === 'unrelated' ? 'bg-gradient-to-r from-stone-600 to-stone-700 w-[24px]' : ''}
                                                ${selectedProperty === 'adjacent' ? 'bg-gradient-to-r from-purple-500 to-purple-600 shadow-[0_0_10px_rgba(168,85,247,0.4)] w-[24px]' : ''}
                                                ${selectedProperty === 'targeted' ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)] w-[24px]' : ''}
                                                ${selectedProperty === 'desired' ? 'bg-gradient-to-r from-pink-500 to-pink-600 shadow-[0_0_10px_rgba(236,72,153,0.4)] w-[24px]' : ''}
                                            `}
                                            style={{
                                                left: selectedProperty === 'unrelated' ? '2px' :
                                                    selectedProperty === 'adjacent' ? '30px' :
                                                        selectedProperty === 'targeted' ? '58px' :
                                                            '86px'
                                            }}
                                        />

                                        {/* Buttons */}
                                        <div className="flex gap-1 relative z-10">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedProperty('unrelated')}
                                                className={`w-6 h-5 flex items-center justify-center rounded-full transition-all duration-200 
                                                    ${selectedProperty === 'unrelated' ? 'text-white' : 'text-stone-400 hover:text-stone-300 hover:bg-white/5'}
                                                `}
                                                title="Unrelated"
                                            >
                                                <ThumbsDown size={10} className={selectedProperty === 'unrelated' ? 'scale-110' : ''} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedProperty('adjacent')}
                                                className={`w-6 h-5 flex items-center justify-center rounded-full transition-all duration-200 
                                                    ${selectedProperty === 'adjacent' ? 'text-white' : 'text-white/40 hover:text-purple-400 hover:bg-white/5'}
                                                `}
                                                title="Adjacent"
                                            >
                                                <GitBranch size={10} className={selectedProperty === 'adjacent' ? 'scale-110' : ''} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedProperty('targeted')}
                                                className={`w-6 h-5 flex items-center justify-center rounded-full transition-all duration-200 
                                                    ${selectedProperty === 'targeted' ? 'text-black/80' : 'text-white/40 hover:text-yellow-400 hover:bg-white/5'}
                                                `}
                                                title="Targeted"
                                            >
                                                <Trophy size={10} className={selectedProperty === 'targeted' ? 'scale-110' : ''} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedProperty('desired')}
                                                className={`w-6 h-5 flex items-center justify-center rounded-full transition-all duration-200 
                                                    ${selectedProperty === 'desired' ? 'text-white' : 'text-white/40 hover:text-pink-500 hover:bg-white/5'}
                                                `}
                                                title="Desired"
                                            >
                                                <Heart size={10} className={selectedProperty === 'desired' ? 'scale-110' : ''} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Color Picker Trigger */}
                                    <div className="relative">
                                        <button
                                            type="button"
                                            ref={pickerTriggerRef}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsColorPickerOpen(!isColorPickerOpen);
                                            }}
                                            className="group relative w-5 h-5 flex items-center justify-center focus:outline-none"
                                        >
                                            <div
                                                className="w-2.5 h-2.5 rounded-full shadow-sm ring-1 ring-white/20 group-hover:ring-white/40 transition-all group-hover:scale-110"
                                                style={{ backgroundColor: selectedColor }}
                                            />
                                        </button>

                                        {/* Color Palette Portal to avoid clipping */}
                                        {isColorPickerOpen && pickerTriggerRef.current && createPortal(
                                            <>
                                                <div
                                                    className="fixed inset-0 z-[9998]"
                                                    onClick={() => setIsColorPickerOpen(false)}
                                                />
                                                <div
                                                    className="fixed z-[9999] bg-[#1a1a1a] border border-white/10 rounded-xl p-3 shadow-xl animate-in zoom-in-95 duration-100 w-[240px]"
                                                    style={{
                                                        bottom: window.innerHeight - pickerTriggerRef.current.getBoundingClientRect().top + 8,
                                                        left: pickerTriggerRef.current.getBoundingClientRect().left - 110 // Center align (240/2 - 20/2 approx)
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="text-[10px] uppercase text-text-tertiary font-bold mb-2 tracking-wider px-1">Select Color</div>
                                                    <NicheColorPickerGrid
                                                        selectedColor={selectedColor}
                                                        onSelect={(color) => {
                                                            setSelectedColor(color);
                                                            setIsColorPickerOpen(false);
                                                        }}
                                                    />
                                                </div>
                                            </>,
                                            document.body
                                        )}
                                    </div>

                                    <div className="flex-1" />

                                    {/* Create Button - Subtle */}
                                    <button
                                        type="submit"
                                        className="h-6 px-3 bg-white/10 hover:bg-white/20 text-white text-[10px] font-medium rounded-full transition-colors flex items-center gap-1"
                                    >
                                        Create
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </FloatingDropdownPortal>
        </div>
    );
};
