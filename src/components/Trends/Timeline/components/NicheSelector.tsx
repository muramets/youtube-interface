import React, { useState, useRef, useMemo } from 'react';
import { FolderPlus, Plus, ChevronDown, Home, Globe } from 'lucide-react';
import type { TrendNiche, TrendVideo } from '../../../../types/trends';
import { useTrendStore, generateNicheColor } from '../../../../stores/trendStore';
import { FloatingNicheItem } from '../FloatingNicheItem';
import { FloatingDropdownPortal } from '../../../Shared/FloatingDropdownPortal';

interface NicheSelectorProps {
    video: TrendVideo;
    isOpen: boolean;
    openAbove: boolean;
    onToggle: () => void;
    onClose: () => void;
}

export const NicheSelector: React.FC<NicheSelectorProps> = ({
    video,
    isOpen,
    openAbove,
    onToggle
}) => {
    const { niches, addNiche, assignVideoToNiche, removeVideoFromNiche, videoNicheAssignments } = useTrendStore();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Local state for creation flow
    const [newNicheName, setNewNicheName] = useState('');
    const [isGlobal, setIsGlobal] = useState(false);
    const [activeNicheMenuId, setActiveNicheMenuId] = useState<string | null>(null);

    // Resolve assigned niches (now array-based)
    const videoAssignments = videoNicheAssignments[video.id] || [];
    const assignedNicheIds = new Set(videoAssignments.map(a => a.nicheId));

    // Find display niche: highest view count, or earliest added if tied
    const displayNiche = useMemo(() => {
        if (videoAssignments.length === 0) return null;

        // Get niches with their view counts
        const nichesWithStats = videoAssignments
            .map(a => {
                const niche = niches.find(n => n.id === a.nicheId);
                return niche ? { niche, addedAt: a.addedAt } : null;
            })
            .filter((n): n is { niche: typeof niches[0], addedAt: number } => n !== null);

        if (nichesWithStats.length === 0) return null;

        // Sort by viewCount desc, then by addedAt asc (earliest first)
        nichesWithStats.sort((a, b) => {
            const viewDiff = (b.niche.viewCount || 0) - (a.niche.viewCount || 0);
            if (viewDiff !== 0) return viewDiff;
            return a.addedAt - b.addedAt; // Earlier added first
        });

        return nichesWithStats[0].niche;
    }, [videoAssignments, niches]);

    // Compute last used timestamp for each niche
    const nicheLastUsed = useMemo(() => {
        const lastUsed = new Map<string, number>();
        // Iterate all assignments to find latest addedAt for each niche
        Object.values(videoNicheAssignments).flat().forEach(assignment => {
            const current = lastUsed.get(assignment.nicheId) || 0;
            if (assignment.addedAt > current) {
                lastUsed.set(assignment.nicheId, assignment.addedAt);
            }
        });
        return lastUsed;
    }, [videoNicheAssignments]);

    const filteredNiches = useMemo(() => {
        return niches.filter(n => {
            if (!newNicheName) return true;
            return n.name.toLowerCase().includes(newNicheName.toLowerCase());
        }).sort((a, b) => {
            const timeA = nicheLastUsed.get(a.id) || 0;
            const timeB = nicheLastUsed.get(b.id) || 0;
            return timeB - timeA; // Most recently used first
        });
    }, [niches, newNicheName, nicheLastUsed]);

    // Auto-focus input when opening
    React.useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newNicheName.trim()) {
            const existingColors = niches.map(n => n.color);
            const newColor = generateNicheColor(existingColors);

            const newNiche: Omit<TrendNiche, 'createdAt' | 'viewCount'> = {
                id: crypto.randomUUID(),
                name: newNicheName.trim(),
                color: newColor,
                type: isGlobal ? 'global' : 'local',
                channelId: video.channelId // Always save origin channel
            };

            addNiche(newNiche);
            assignVideoToNiche(video.id, newNiche.id);

            setNewNicheName('');
            onToggle(); // Close after create
        }
    };

    const handleNicheToggle = (nicheId: string, isAssigned: boolean) => {
        if (isAssigned) {
            removeVideoFromNiche(video.id, nicheId);
        } else {
            assignVideoToNiche(video.id, nicheId);
        }
    };

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onToggle}
                className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
                    ${displayNiche ? 'bg-white/10 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}
                    ${isOpen ? 'ring-1 ring-white/30' : ''}
                `}
                style={{ backgroundColor: displayNiche?.color ? `${displayNiche.color}20` : undefined }}
            >
                {displayNiche ? (
                    <>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: displayNiche.color }} />
                        <span className="truncate max-w-[120px]">{displayNiche.name}</span>
                        {assignedNicheIds.size > 1 && (
                            <span className="text-[10px] text-text-secondary">+{assignedNicheIds.size - 1}</span>
                        )}
                    </>
                ) : (
                    <>
                        <FolderPlus size={16} />
                        Assign Niche
                    </>
                )}
                <ChevronDown size={14} className={`transition-transform ${isOpen ? '' : 'rotate-180'}`} />
            </button>

            <FloatingDropdownPortal
                isOpen={isOpen}
                anchorRect={buttonRef.current?.getBoundingClientRect() || null}
                openAbove={openAbove}
            >
                <div data-portal-wrapper className="flex flex-col h-full">
                    {/* Header / Create */}
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
                                />
                                <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                            </div>
                            {newNicheName && (
                                <div className="flex items-center justify-between px-1 gap-3">
                                    {/* Premium Sliding Pill Toggle */}
                                    <div className="relative flex bg-white/5 rounded-full p-0.5 border border-white/10 backdrop-blur-sm">
                                        {/* Sliding Indicator */}
                                        <div
                                            className="absolute top-0.5 h-[calc(100%-4px)] w-[calc(50%-2px)] bg-gradient-to-r from-white/25 to-white/15 rounded-full transition-all duration-300 ease-out shadow-sm"
                                            style={{
                                                left: isGlobal ? 'calc(50% + 1px)' : '2px',
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIsGlobal(false)}
                                            className={`relative z-10 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all duration-200 ${!isGlobal ? 'text-white font-medium' : 'text-text-secondary hover:text-white/70'}`}
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
                    {/* List */}
                    <div className="overflow-y-auto custom-scrollbar p-1 flex-1">
                        {filteredNiches.map(niche => {
                            const isAssigned = assignedNicheIds.has(niche.id);
                            return (
                                <FloatingNicheItem
                                    key={niche.id}
                                    niche={niche}
                                    isAssigned={isAssigned}
                                    isActive={activeNicheMenuId === niche.id}
                                    onToggle={() => handleNicheToggle(niche.id, isAssigned)}
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
