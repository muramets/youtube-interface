import React, { useMemo, useLayoutEffect, useRef, useState } from 'react';
import { Check, Search, CheckCheck, CircleOff } from 'lucide-react';
import type { TrafficGroup, TrafficSource } from '../../../../../core/types/traffic';

// Special ID for "Unassigned" filter option
export const UNASSIGNED_NICHE_ID = 'UNASSIGNED';

interface TrafficFilterInputNicheProps {
    groups: TrafficGroup[]; // Available niches
    sources: TrafficSource[]; // For calculating view counts
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

export const TrafficFilterInputNiche: React.FC<TrafficFilterInputNicheProps> = ({
    groups,
    sources,
    initialSelected,
    onApply
}) => {
    const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
    const [searchQuery, setSearchQuery] = useState('');

    // Width fixing (prevent layout shift during filtering)
    const containerRef = useRef<HTMLDivElement>(null);
    const [fixedWidth, setFixedWidth] = useState<number | undefined>(undefined);

    useLayoutEffect(() => {
        if (containerRef.current && !fixedWidth) {
            // Measure the natural width with all content initially rendered
            setFixedWidth(containerRef.current.offsetWidth);
        }
    }, []);

    const toggleNiche = (id: string) => {
        const newSelection = selectedIds.includes(id)
            ? selectedIds.filter(s => s !== id)
            : [...selectedIds, id];

        setSelectedIds(newSelection);
        onApply(newSelection);
    };

    // 1. Calculate Counts dynamically (Impressions & Views)
    const nicheStats = useMemo(() => {
        const stats = new Map<string, { views: number; impressions: number }>();

        // Pre-compute videoId -> Set<NicheId> map
        const videoIdToGroupIds = new Map<string, string[]>();
        groups.forEach(group => {
            group.videoIds.forEach(vid => {
                const list = videoIdToGroupIds.get(vid) || [];
                list.push(group.id);
                videoIdToGroupIds.set(vid, list);
            });
        });

        sources.forEach(source => {
            if (!source.videoId) return;
            const groupIds = videoIdToGroupIds.get(source.videoId);
            if (groupIds) {
                groupIds.forEach(gid => {
                    const current = stats.get(gid) || { views: 0, impressions: 0 };
                    stats.set(gid, {
                        views: current.views + source.views,
                        impressions: current.impressions + source.impressions
                    });
                });
            }
        });

        return stats;
    }, [sources, groups]);

    // Calculate unassigned stats
    const unassignedStats = useMemo(() => {
        let views = 0;
        let impressions = 0;

        const coveredVideoIds = new Set<string>();
        groups.forEach(g => g.videoIds.forEach(vid => coveredVideoIds.add(vid)));

        sources.forEach(source => {
            if (!source.videoId || !coveredVideoIds.has(source.videoId)) {
                views += source.views;
                impressions += source.impressions;
            }
        });
        return { views, impressions };
    }, [sources, groups]);

    // 2. Sort niches: View Count (desc), then Name (asc)
    // Identify Trash Group
    const trashGroup = useMemo(() => {
        return groups.find(g => g.name.trim().toLowerCase() === 'trash');
    }, [groups]);

    // 2. Sort niches: View Count (desc), then Name (asc)
    const sortedNiches = useMemo(() => {
        const otherGroups = trashGroup ? groups.filter(g => g.id !== trashGroup.id) : groups;
        return [...otherGroups].sort((a, b) => {
            const statsA = nicheStats.get(a.id) || { views: 0 };
            const statsB = nicheStats.get(b.id) || { views: 0 };
            if (statsA.views !== statsB.views) return statsB.views - statsA.views;
            return a.name.localeCompare(b.name);
        });
    }, [groups, nicheStats, trashGroup]);

    // Filter logic (Applied to sortedNiches which now excludes Trash)
    const filteredNiches = useMemo(() => {
        if (!searchQuery.trim()) return sortedNiches;
        const lowerQuery = searchQuery.toLowerCase();
        return sortedNiches.filter(n => n.name.toLowerCase().includes(lowerQuery));
    }, [sortedNiches, searchQuery]);

    const showUnassigned = useMemo(() => {
        if (!searchQuery.trim()) return true;
        return 'unassigned'.includes(searchQuery.toLowerCase());
    }, [searchQuery]);

    const showTrash = useMemo(() => {
        if (!trashGroup) return false;
        if (!searchQuery.trim()) return true;
        return trashGroup.name.toLowerCase().includes(searchQuery.toLowerCase());
    }, [searchQuery, trashGroup]);

    // ... select all logic remains same ...
    const handleSelectAll = () => {
        const visibleIds = filteredNiches.map(n => n.id);
        const allVisibleSelected = visibleIds.every(id => selectedIds.includes(id));
        let newSelection: string[];
        if (allVisibleSelected) {
            newSelection = selectedIds.filter(id => !visibleIds.includes(id));
        } else {
            newSelection = Array.from(new Set([...selectedIds, ...visibleIds]));
        }
        setSelectedIds(newSelection);
        onApply(newSelection);
    };

    const renderItem = (id: string, name: string, color: string | undefined, stats: { views: number, impressions: number }, isUnassigned: boolean) => {
        const isSelected = selectedIds.includes(id);
        const formattedViews = formatViewCount(stats.views);
        const formattedImpr = formatViewCount(stats.impressions);

        return (
            <div
                key={id}
                onClick={() => toggleNiche(id)}
                className="px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors rounded-lg text-text-primary text-sm hover:bg-[#2a2a2a] group"
                title={`Impressions: ${stats.impressions.toLocaleString()}\nViews: ${stats.views.toLocaleString()}`}
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

                {/* Icon or Dot */}
                {isUnassigned ? (
                    <CircleOff size={12} className="text-text-tertiary flex-shrink-0" />
                ) : (
                    <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                    />
                )}

                {/* Name */}
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                    {name}
                </span>

                {/* Stats: IMPR / VIEWS */}
                <div className="flex items-center gap-1 text-[10px] text-text-tertiary font-medium opacity-60">
                    <span>{formattedImpr}</span>
                    <span className="text-text-tertiary/50">•</span>
                    <span>{formattedViews}</span>
                </div>
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className="flex flex-col max-h-[300px] transition-[width]"
            style={{ width: fixedWidth ? `${fixedWidth}px` : 'auto', minWidth: '220px' }}
        >
            {/* Search Input Header */}
            <div className="px-3 py-2 border-b border-[#2a2a2a] sticky top-0 bg-[#1F1F1F] z-10 flex items-center gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search niches..."
                        className="w-full bg-[#161616] border border-transparent focus:border-[#333333] rounded-md py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder-text-tertiary outline-none transition-colors"
                        autoFocus
                    />
                </div>
                <button
                    onClick={handleSelectAll}
                    className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-white/5 rounded transition-colors"
                    title="Select all visible"
                >
                    <CheckCheck size={16} />
                </button>
            </div>

            <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                {/* Stats Legend Header (Mini) */}
                <div className="px-3 pt-2 pb-1 flex justify-end gap-1 text-[9px] text-text-tertiary font-medium uppercase tracking-wider opacity-50">
                    <span>Impr</span>
                    <span>•</span>
                    <span>Views</span>
                </div>

                {/* Unassigned option */}
                {/* Unassigned & Trash Block */}
                {(showUnassigned || showTrash) && (
                    <>
                        {showUnassigned && renderItem(UNASSIGNED_NICHE_ID, 'Unassigned', undefined, unassignedStats, true)}

                        {showTrash && trashGroup && (
                            renderItem(
                                trashGroup.id,
                                'Trash',
                                trashGroup.color,
                                nicheStats.get(trashGroup.id) || { views: 0, impressions: 0 },
                                false
                            )
                        )}

                        {filteredNiches.length > 0 && <div className="mx-2 my-1 h-px bg-white/5" />}
                    </>
                )}

                {filteredNiches.length === 0 && !showUnassigned && !showTrash ? (
                    <div className="px-4 py-8 text-center text-text-tertiary text-xs">
                        No niches found
                    </div>
                ) : (
                    filteredNiches.map(niche => {
                        const stats = nicheStats.get(niche.id) || { views: 0, impressions: 0 };
                        return renderItem(niche.id, niche.name, niche.color, stats, false);
                    })
                )}
            </div>

            <div className="p-2 border-t border-[#2a2a2a] flex justify-between items-center text-[10px] text-text-tertiary">
                <span>{selectedIds.length} selected</span>
                {selectedIds.length > 0 && (
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
