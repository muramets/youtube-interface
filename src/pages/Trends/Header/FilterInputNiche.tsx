import React, { useMemo, useLayoutEffect, useRef, useState } from 'react';
import { Check, Globe, Home, Search, CheckCheck, CircleOff } from 'lucide-react';
import { useTrendStore } from '../../../core/stores/trendStore';

// Special ID for "Unassigned" filter option
export const UNASSIGNED_NICHE_ID = 'UNASSIGNED';

interface FilterInputNicheProps {
    initialSelected: string[];
    onApply: (selectedIds: string[]) => void;
}

const formatViewCount = (num?: number) => {
    if (!num) return '0';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

export const FilterInputNiche: React.FC<FilterInputNicheProps> = ({
    initialSelected,
    onApply
}) => {
    const { niches, videos, videoNicheAssignments, selectedChannelId } = useTrendStore();
    const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
    const [searchQuery, setSearchQuery] = useState('');

    // Width fixing
    const containerRef = useRef<HTMLDivElement>(null);
    const [fixedWidth, setFixedWidth] = useState<number | undefined>(undefined);

    useLayoutEffect(() => {
        if (containerRef.current && !fixedWidth) {
            // Measure the natural width with all content initially rendered
            // We use getBoundingClientRect to be precise, or offsetWidth.
            // We want to lock this width so it doesn't shrink.
            setFixedWidth(containerRef.current.offsetWidth);
        }
    }, []); // Run once on mount

    const toggleNiche = (id: string) => {
        const newSelection = selectedIds.includes(id)
            ? selectedIds.filter(s => s !== id)
            : [...selectedIds, id];

        setSelectedIds(newSelection);
        onApply(newSelection);
    };

    // Filter niches by channel: global + local matching current channel
    const channelFilteredNiches = useMemo(() => {
        return niches.filter(niche => {
            // Global niches are always available
            if (niche.type === 'global') return true;

            // Local niches are available if they match the selected channel
            if (niche.type === 'local' && niche.channelId && selectedChannelId) {
                return niche.channelId === selectedChannelId;
            }

            // If no channel selected (main trends), show all local niches
            if (!selectedChannelId && niche.type === 'local') return true;

            return false;
        });
    }, [niches, selectedChannelId]);

    // 1. Calculate View Counts dynamically
    const nicheViewCounts = useMemo(() => {
        const counts = new Map<string, number>();
        videos.forEach(v => {
            const assignments = videoNicheAssignments[v.id] || [];
            const nicheIds = assignments.length > 0
                ? assignments.map(a => a.nicheId)
                : (v.nicheId ? [v.nicheId] : []);

            nicheIds.forEach(nicheId => {
                counts.set(nicheId, (counts.get(nicheId) || 0) + v.viewCount);
            });
        });
        return counts;
    }, [videos, videoNicheAssignments]);

    // Calculate unassigned video count (videos with no niche)
    const unassignedViewCount = useMemo(() => {
        let count = 0;
        videos.forEach(v => {
            const assignments = videoNicheAssignments[v.id] || [];
            if (assignments.length === 0 && !v.nicheId) {
                count += v.viewCount;
            }
        });
        return count;
    }, [videos, videoNicheAssignments]);

    // 2. Sort niches: View Count (desc), then Name (asc)
    const sortedNiches = useMemo(() => {
        return [...channelFilteredNiches].sort((a, b) => {
            const countA = nicheViewCounts.get(a.id) || 0;
            const countB = nicheViewCounts.get(b.id) || 0;
            if (countA !== countB) return countB - countA;
            return a.name.localeCompare(b.name);
        });
    }, [channelFilteredNiches, nicheViewCounts]);

    // 3. Filter by search query
    const filteredNiches = useMemo(() => {
        if (!searchQuery.trim()) return sortedNiches;
        const lowerQuery = searchQuery.toLowerCase();
        return sortedNiches.filter(n => n.name.toLowerCase().includes(lowerQuery));
    }, [sortedNiches, searchQuery]);

    // Check if "Unassigned" matches search query
    const showUnassigned = useMemo(() => {
        if (!searchQuery.trim()) return true;
        return 'unassigned'.includes(searchQuery.toLowerCase());
    }, [searchQuery]);

    const handleSelectAll = () => {
        // Select all CURRENTLY VISIBLE (filtered) niches
        // If some are already selected, we just add the missing ones.
        // If ALL visible are already selected, maybe deselect them? 
        // User asked for "select all icon", let's assume additive or toggle all visible.
        // "Select all visible niches".

        const visibleIds = filteredNiches.map(n => n.id);
        const allVisibleSelected = visibleIds.every(id => selectedIds.includes(id));

        let newSelection: string[];
        if (allVisibleSelected) {
            // Deselect visible
            newSelection = selectedIds.filter(id => !visibleIds.includes(id));
        } else {
            // Select all visible (merge unique)
            newSelection = Array.from(new Set([...selectedIds, ...visibleIds]));
        }

        setSelectedIds(newSelection);
        onApply(newSelection);
    };

    return (
        <div
            ref={containerRef}
            className="flex flex-col max-h-[300px] transition-[width]"
            style={{ width: fixedWidth ? `${fixedWidth}px` : 'auto', minWidth: '200px' }}
        >
            {/* Search Input Header */}
            <div className="px-3 py-2 border-b border-border sticky top-0 bg-[#1F1F1F] z-10 flex items-center gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search niches..."
                        className="w-full bg-bg-secondary border border-transparent focus:border-border rounded-md py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder-text-tertiary outline-none transition-colors"
                        autoFocus
                    />
                </div>
                {/* Select All Icon */}
                <button
                    onClick={handleSelectAll}
                    className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-white/5 rounded transition-colors"
                    title="Select all visible"
                >
                    <CheckCheck size={16} />
                </button>
            </div>

            <div className="overflow-y-auto flex-1 p-1">
                {/* Unassigned option */}
                {showUnassigned && (
                    <div
                        onClick={() => toggleNiche(UNASSIGNED_NICHE_ID)}
                        className="px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors rounded-lg text-text-primary text-sm hover:bg-hover-bg group border-b border-white/20 mb-1"
                    >
                        {/* Checkbox */}
                        <div
                            className={`w-[16px] h-[16px] rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selectedIds.includes(UNASSIGNED_NICHE_ID)
                                ? 'bg-text-primary border-text-primary'
                                : 'bg-transparent border-text-secondary group-hover:border-text-primary'
                                }`}
                        >
                            {selectedIds.includes(UNASSIGNED_NICHE_ID) && <Check size={10} className="text-bg-primary" strokeWidth={3} />}
                        </div>

                        {/* Icon */}
                        <CircleOff size={12} className="text-text-tertiary flex-shrink-0" />

                        {/* Name */}
                        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                            Unassigned
                        </span>

                        {/* View Count */}
                        <span className="text-[10px] text-text-tertiary font-medium opacity-60">
                            {formatViewCount(unassignedViewCount)}
                        </span>
                    </div>
                )}

                {filteredNiches.length === 0 && !showUnassigned ? (
                    <div className="px-4 py-8 text-center text-text-tertiary text-xs">
                        No niches found
                    </div>
                ) : (
                    filteredNiches.map(niche => {
                        const isSelected = selectedIds.includes(niche.id);
                        const viewCount = nicheViewCounts.get(niche.id) || 0;
                        const formattedViews = formatViewCount(viewCount);

                        return (
                            <div
                                key={niche.id}
                                onClick={() => toggleNiche(niche.id)}
                                className="px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors rounded-lg text-text-primary text-sm hover:bg-hover-bg group"
                            >
                                {/* Checkbox */}
                                <div
                                    className={`w-[16px] h-[16px] rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected
                                        ? 'bg-text-primary border-text-primary'
                                        : 'bg-transparent border-text-secondary group-hover:border-text-primary'
                                        }`}
                                >
                                    {isSelected && <Check size={10} className="text-bg-primary" strokeWidth={3} />}
                                </div>

                                {/* Color dot */}
                                <div
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: niche.color }}
                                />

                                {/* Name */}
                                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                                    {niche.name}
                                </span>

                                {/* View Count */}
                                <span className="text-[10px] text-text-tertiary font-medium opacity-60">
                                    {formattedViews}
                                </span>

                                {/* Globe/Home Icon */}
                                {niche.type === 'global' ? (
                                    <Globe size={12} className="text-text-tertiary flex-shrink-0 opacity-60" />
                                ) : (
                                    <Home size={12} className="text-text-tertiary flex-shrink-0 opacity-60" />
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="p-2 border-t border-border flex justify-between items-center text-[10px] text-text-tertiary">
                <span>{selectedIds.length} selected</span>
                {selectedIds.length > 1 && (
                    <button
                        onClick={() => {
                            setSelectedIds([]);
                            onApply([]);
                        }}
                        className="text-text-primary hover:underline hover:text-red-400 transition-colors"
                    >
                        Clear selection
                    </button>
                )}
            </div>
        </div>
    );
};
