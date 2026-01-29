import React, { useState, useRef, useMemo } from 'react';
import { FolderPlus, Plus, ChevronDown, Home, Globe } from 'lucide-react';
import type { TrendNiche, TrendVideo } from '../../../../core/types/trends';
import { useTrendStore, generateNicheColor } from '../../../../core/stores/trendStore';
import { FloatingNicheItem } from '../FloatingNicheItem';
import { FloatingDropdownPortal } from '../../../../components/ui/atoms/FloatingDropdownPortal';

interface NicheSelectorProps {
    videos: TrendVideo[];
    isOpen: boolean;
    openAbove: boolean;
    onToggle: () => void;
    onClose: () => void;
    onSelectionClear?: () => void;
}

export const NicheSelector: React.FC<NicheSelectorProps> = ({
    videos,
    isOpen,
    openAbove,
    onToggle,
    onSelectionClear
}) => {
    const { niches, addNiche, assignVideoToNiche, removeVideoFromNiche, videoNicheAssignments } = useTrendStore();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Local state for creation flow
    const [newNicheName, setNewNicheName] = useState('');
    const [isGlobal, setIsGlobal] = useState(false);
    const [activeNicheMenuId, setActiveNicheMenuId] = useState<string | null>(null);
    const [stableNiches, setStableNiches] = useState<TrendNiche[]>([]);

    const isMultiSelect = videos.length > 1;
    const isMultiChannel = new Set(videos.map(v => v.channelId)).size > 1;

    // Resolve assigned niches
    const nicheAssignmentStatus = useMemo(() => {
        const status = new Map<string, 'all' | 'some' | 'none'>();
        niches.forEach(niche => {
            let count = 0;
            videos.forEach(v => {
                const assignments = videoNicheAssignments[v.id] || [];
                if (assignments.some(a => a.nicheId === niche.id)) {
                    count++;
                }
            });

            if (count === videos.length) status.set(niche.id, 'all');
            else if (count > 0) status.set(niche.id, 'some');
            else status.set(niche.id, 'none');
        });
        return status;
    }, [niches, videos, videoNicheAssignments]);

    // Display Niche Logic (Button Label)
    const displayNiche = useMemo(() => {
        if (isMultiSelect) return null;
        const video = videos[0];
        if (!video) return null;
        const videoAssignments = videoNicheAssignments[video.id] || [];
        if (videoAssignments.length === 0) return null;

        const nichesWithStats = videoAssignments
            .map(a => {
                const niche = niches.find(n => n.id === a.nicheId);
                return niche ? { niche, addedAt: a.addedAt } : null;
            })
            .filter((n): n is { niche: typeof niches[0], addedAt: number } => n !== null);

        if (nichesWithStats.length === 0) return null;

        nichesWithStats.sort((a, b) => {
            const viewDiff = (b.niche.viewCount || 0) - (a.niche.viewCount || 0);
            if (viewDiff !== 0) return viewDiff;
            return a.addedAt - b.addedAt;
        });

        return nichesWithStats[0].niche;
    }, [videos, videoNicheAssignments, niches, isMultiSelect]);

    // Compute last used timestamp for each niche
    const nicheLastUsed = useMemo(() => {
        const lastUsed = new Map<string, number>();
        Object.values(videoNicheAssignments).flat().forEach(assignment => {
            const current = lastUsed.get(assignment.nicheId) || 0;
            if (assignment.addedAt > current) {
                lastUsed.set(assignment.nicheId, assignment.addedAt);
            }
        });
        return lastUsed;
    }, [videoNicheAssignments]);

    // Determine unique channel IDs from selected videos
    const selectedChannelIds = useMemo(() => {
        return new Set(videos.map(v => v.channelId));
    }, [videos]);

    // Filter niches based on channel context:
    // - If multiple channels selected → only global niches
    // - If single channel selected → global niches + local niches for that channel
    const availableNiches = useMemo(() => {
        const isMultiChannel = selectedChannelIds.size > 1;

        return niches.filter(niche => {
            // Global niches are always available
            if (niche.type === 'global') return true;

            // Local niches only available if all videos are from the same channel
            if (!isMultiChannel && niche.type === 'local' && niche.channelId) {
                return selectedChannelIds.has(niche.channelId);
            }

            return false;
        });
    }, [niches, selectedChannelIds]);

    // Compute the 'ideal' sorted niches from available niches
    const currentSortedNiches = useMemo(() => {
        return [...availableNiches].sort((a, b) => {
            const timeA = nicheLastUsed.get(a.id) || 0;
            const timeB = nicheLastUsed.get(b.id) || 0;

            // 1. Sort by Last Used (Most recent first)
            if (timeA !== timeB) return timeB - timeA;

            // 2. If never used (or equal time), prioritize Global over Local
            if (a.type !== b.type) {
                return a.type === 'global' ? -1 : 1;
            }

            // 3. Alphabetical fallback
            return a.name.localeCompare(b.name);
        });
    }, [availableNiches, nicheLastUsed]);

    // Stabilize niche order: only update stableNiches when NOT open,
    // unless the list of available niches actually changed (new data loaded).
    React.useEffect(() => {
        if (!isOpen) {
            setStableNiches(currentSortedNiches);
            return;
        }

        // If open, only update if the composition (ids) changed
        const stableIds = new Set(stableNiches.map(n => n.id));
        const currentIds = new Set(currentSortedNiches.map(n => n.id));

        let hasStructuralChanges = false;
        if (stableNiches.length !== currentSortedNiches.length) {
            hasStructuralChanges = true;
        } else {
            for (const id of currentIds) {
                if (!stableIds.has(id)) {
                    hasStructuralChanges = true;
                    break;
                }
            }
        }

        if (hasStructuralChanges) {
            setStableNiches(currentSortedNiches);
        }
    }, [isOpen, currentSortedNiches, stableNiches]);

    const filteredNiches = useMemo(() => {
        if (!newNicheName.trim()) return stableNiches;

        const searchTerms = newNicheName.toLowerCase().trim().split(/\s+/);

        return stableNiches.filter(n => {
            const nameLower = n.name.toLowerCase();
            // All terms must be found in the name
            return searchTerms.every(term => nameLower.includes(term));
        });
    }, [stableNiches, newNicheName]);

    // Auto-focus input when opening
    React.useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    // Force global mode when multiple channels are selected
    React.useEffect(() => {
        if (isMultiChannel) {
            setIsGlobal(true);
        }
    }, [isMultiChannel]);

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newNicheName.trim()) {
            const existingColors = niches.map(n => n.color);
            const newColor = generateNicheColor(existingColors);

            const newNiche: Omit<TrendNiche, 'createdAt' | 'viewCount'> = {
                id: crypto.randomUUID(),
                name: newNicheName.trim(),
                color: newColor,
                type: isGlobal ? 'global' : 'local',
                channelId: videos[0]?.channelId || '' // Use first video's channel as origin
            };

            // Perform UI actions immediately (optimistic)
            onToggle();
            onSelectionClear?.();

            // Perform backend actions in background
            await addNiche(newNiche);
            await Promise.all(videos.map(v => assignVideoToNiche(v.id, newNiche.id, v.viewCount)));

            setNewNicheName('');
        }
    };

    const handleNicheToggle = async (nicheId: string, currentStatus: 'all' | 'some' | 'none') => {
        // ... (behavior comment remains)

        const shouldAdd = currentStatus !== 'all';

        await Promise.all(videos.map(async (v) => {
            if (shouldAdd) {
                // Prevent duplicate assignment if already assigned
                const assigned = (videoNicheAssignments[v.id] || []).some(a => a.nicheId === nicheId);
                if (!assigned) await assignVideoToNiche(v.id, nicheId, v.viewCount);
            } else {
                await removeVideoFromNiche(v.id, nicheId, v.viewCount);
            }
        }));
    };

    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset highlighted index when keys change
    React.useEffect(() => {
        setHighlightedIndex(-1);
    }, [filteredNiches, newNicheName]); // Reset when filter changes

    // Scroll highlighted item into view
    React.useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const item = listRef.current.children[highlightedIndex] as HTMLElement;
            if (item) {
                item.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (filteredNiches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, filteredNiches.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Allow going back to -1 (input focus state)
            setHighlightedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            // If we have a valid selection, toggle it & prevent form submit
            if (highlightedIndex >= 0 && filteredNiches[highlightedIndex]) {
                e.preventDefault();
                e.stopPropagation();

                const niche = filteredNiches[highlightedIndex];
                const status = nicheAssignmentStatus.get(niche.id) || 'none';
                handleNicheToggle(niche.id, status);

                // Optional: Clear input or close?
                // Usually we keep it open for multi-select, or close?
                // If single video, maybe close?
                // Current behavior of clicking item is: it stays open (see handleNicheToggle).
                // So we just toggle.
            }
        } else if (e.key === 'Escape') {
            // Handled by input's existing handler, or we can unify here
        }
    };

    return (
        <div className="relative">
            {/* ... button ... */}
            <button
                ref={buttonRef}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onToggle}
                className={`
                    relative flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
                    before:absolute before:inset-[-8px] before:content-['']
                    ${displayNiche ? 'bg-white/10 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}
                    ${isOpen ? 'ring-1 ring-white/30' : ''}
                `}
                style={{ backgroundColor: displayNiche?.color ? `${displayNiche.color}20` : undefined }}
            >
                {/* ... button content ... */}
                {displayNiche ? (
                    <>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: displayNiche.color }} />
                        <span className="truncate max-w-[120px]">{displayNiche.name}</span>
                        {/* If single video and has multiple niches, show count */}
                        {videos[0] && (videoNicheAssignments[videos[0].id] || []).length > 1 && (
                            <span className="text-[10px] text-text-secondary">
                                +{(videoNicheAssignments[videos[0].id] || []).length - 1}
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <FolderPlus size={16} />
                        {isMultiSelect ? 'Assign Niches' : 'Assign Niche'}
                    </>
                )}
                <ChevronDown size={14} className={`transition-transform ${isOpen ? '' : 'rotate-180'}`} />
            </button>

            <FloatingDropdownPortal
                isOpen={isOpen}
                anchorRect={buttonRef.current?.getBoundingClientRect() || null}
                openAbove={openAbove}
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
                                    value={newNicheName}
                                    onChange={(e) => setNewNicheName(e.target.value)}
                                    onKeyDown={(e) => {
                                        // Handle navigation keys
                                        handleKeyDown(e);

                                        // Original Escape logic
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            onToggle();
                                        }
                                    }}
                                />
                                <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                            </div>
                            {newNicheName && (
                                <div className="flex items-center justify-between px-1 gap-3">
                                    <div className="relative flex bg-white/5 rounded-full p-0.5 border border-white/10 backdrop-blur-sm">
                                        <div
                                            className="absolute top-0.5 h-[calc(100%-4px)] w-[calc(50%-2px)] bg-gradient-to-r from-white/25 to-white/15 rounded-full transition-all duration-300 ease-out shadow-sm"
                                            style={{
                                                left: isGlobal ? 'calc(50% + 1px)' : '2px',
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => !isMultiChannel && setIsGlobal(false)}
                                            disabled={isMultiChannel}
                                            className={`relative z-10 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all duration-200 ${isMultiChannel ? 'text-text-tertiary cursor-not-allowed opacity-50' : (!isGlobal ? 'text-white font-medium' : 'text-text-secondary hover:text-white/70')}`}
                                            title={isMultiChannel ? 'Local niches not available for multi-channel selection' : undefined}
                                        >
                                            <Home size={9} className="flex-shrink-0" />
                                            <span>Local</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsGlobal(true)}
                                            className={`relative z-10 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all duration-200 ${isGlobal ? 'text-white font-medium' : 'text-text-secondary hover:text-white/70'}`}
                                        >
                                            <Globe size={9} className="flex-shrink-0" />
                                            <span>Global</span>
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
                            const status = nicheAssignmentStatus.get(niche.id) || 'none';
                            const isAssigned = status === 'all';

                            return (
                                <FloatingNicheItem
                                    key={niche.id}
                                    niche={niche}
                                    isAssigned={isAssigned}
                                    isActive={activeNicheMenuId === niche.id}
                                    isHighlighted={index === highlightedIndex}
                                    onToggle={() => handleNicheToggle(niche.id, status)}
                                    onToggleMenu={() => setActiveNicheMenuId(current => current === niche.id ? null : niche.id)}
                                    onCloseMenu={() => setActiveNicheMenuId(null)}
                                />
                            );
                        })}
                        {filteredNiches.length === 0 && !newNicheName && (
                            <div className="text-center py-3 text-xs text-text-tertiary">No niches found</div>
                        )}
                    </div>
                </div>
            </FloatingDropdownPortal>
        </div>
    );
};
