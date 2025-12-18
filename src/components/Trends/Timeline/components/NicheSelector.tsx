import React, { useState, useRef, useMemo } from 'react';
import { FolderPlus, Plus, ChevronDown, Home, Globe } from 'lucide-react';
import type { TrendNiche, TrendVideo } from '../../../../types/trends';
import { useTrendStore, generateNicheColor } from '../../../../stores/trendStore';
import { FloatingNicheItem } from '../FloatingNicheItem';
import { FloatingDropdownPortal } from '../../../Shared/FloatingDropdownPortal';

interface NicheSelectorProps {
    videos: TrendVideo[];
    isOpen: boolean;
    openAbove: boolean;
    onToggle: () => void;
    onClose: () => void;
}

export const NicheSelector: React.FC<NicheSelectorProps> = ({
    videos,
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

    const isMultiSelect = videos.length > 1;

    // Resolve assigned niches
    // For single video: show its niches
    // For multi: show intersection? or just show state in dropdown?
    // Let's resolve "common" niches for the button label, but track individual for the list.
    // Check which niches are assigned to ALL selected videos (for checkbox state 'checked')
    // And which are partial (for 'indeterminate' - though custom UI just checking if assigned to specific video in loop)
    // For the UI list:
    // We need to know if a niche is assigned to ALL, SOME, or NONE.
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
        if (isMultiSelect) return null; // Don't show specific niche color for mixed selection

        const video = videos[0];
        if (!video) return null;
        const videoAssignments = videoNicheAssignments[video.id] || [];
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
            return a.addedAt - b.addedAt;
        });

        return nichesWithStats[0].niche;
    }, [videos, videoNicheAssignments, niches, isMultiSelect]);

    // Compute last used timestamp for each niche (from all videos context?)
    // Using global stats is better for ordering
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

    const filteredNiches = useMemo(() => {
        return niches.filter(n => {
            if (!newNicheName) return true;
            return n.name.toLowerCase().includes(newNicheName.toLowerCase());
        }).sort((a, b) => {
            const timeA = nicheLastUsed.get(a.id) || 0;
            const timeB = nicheLastUsed.get(b.id) || 0;
            return timeB - timeA;
        });
    }, [niches, newNicheName, nicheLastUsed]);

    // Auto-focus input when opening
    React.useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

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

            // Wait for niche to be created in Firestore before assigning videos
            await addNiche(newNiche);

            // Assign to ALL selected videos (wait for all to complete)
            await Promise.all(videos.map(v => assignVideoToNiche(v.id, newNiche.id, v.viewCount)));

            setNewNicheName('');
            onToggle();
        }
    };

    const handleNicheToggle = (nicheId: string, currentStatus: 'all' | 'some' | 'none') => {
        // Behavior: 
        // If 'all' -> remove from all
        // If 'some' -> add to remaining (make all)
        // If 'none' -> add to all

        const shouldAdd = currentStatus !== 'all';

        videos.forEach(v => {
            if (shouldAdd) {
                // Prevent duplicate assignment if already assigned
                const assigned = (videoNicheAssignments[v.id] || []).some(a => a.nicheId === nicheId);
                if (!assigned) assignVideoToNiche(v.id, nicheId, v.viewCount);
            } else {
                removeVideoFromNiche(v.id, nicheId, v.viewCount);
            }
        });
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
                        {/* If single video and has multiple niches, show count */}
                        {/* If multi select, we didn't enter this block */}
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
                <div data-portal-wrapper className="flex flex-col h-full">
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
                                    <div className="relative flex bg-white/5 rounded-full p-0.5 border border-white/10 backdrop-blur-sm">
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
                    <div className="overflow-y-auto custom-scrollbar p-1 flex-1">
                        {filteredNiches.map(niche => {
                            const status = nicheAssignmentStatus.get(niche.id) || 'none';
                            const isAssigned = status === 'all';
                            // Optional: Distinct visual for 'some' (partial) if FloatingNicheItem supports it.
                            // If not, we'll just treat 'all' as checked and 'some'/'none' as unchecked for now, 
                            // or maybe force 'some' to look different? 
                            // Since I can't easily change FloatingNicheItem props right now without seeing it, I'll stick to simple boolean 'isAssigned' = status === 'all'. 
                            // Wait, if status is 'some', users might want to know.
                            // But FloatingNicheItem prop is 'isAssigned'. I'll pass true only if ALL are assigned.

                            return (
                                <FloatingNicheItem
                                    key={niche.id}
                                    niche={niche}
                                    isAssigned={isAssigned}
                                    isActive={activeNicheMenuId === niche.id}
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
