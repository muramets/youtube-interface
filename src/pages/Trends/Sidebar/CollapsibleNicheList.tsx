import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TrendNiche } from '../../../core/types/trends';
import { TrendNicheItem } from './TrendNicheItem';

interface CollapsibleNicheListProps {
    niches: TrendNiche[];
    activeNicheIds: string[];
    onNicheClick: (id: string | null) => void;
    initialVisibleCount?: number;
    trashCount?: number;
    storageKey?: string; // Optional key for localStorage persistence (e.g. 'global' or channelId)
}

export const CollapsibleNicheList: React.FC<CollapsibleNicheListProps> = ({
    niches,
    activeNicheIds,
    onNicheClick,
    initialVisibleCount = 5,
    trashCount = 0,
    storageKey
}) => {
    const lsKey = storageKey ? `trends-niche-list-expanded-${storageKey}` : null;

    const [isExpanded, setIsExpanded] = useState(() => {
        if (!lsKey) return false;
        const saved = localStorage.getItem(lsKey);
        return saved !== null ? saved === 'true' : false; // Default collapsed
    });

    useEffect(() => {
        if (lsKey) {
            localStorage.setItem(lsKey, String(isExpanded));
        }
    }, [isExpanded, lsKey]);

    // Create a unified list including the virtual "Trash" niche if needed
    const allNiches = [...niches];
    if (trashCount > 0) {
        allNiches.push({
            id: 'TRASH',
            name: 'Untracked',
            color: '#6B7280', // Gray
            viewCount: trashCount,
            createdAt: 0
        } as unknown as TrendNiche);
    }

    if (allNiches.length === 0) return null;

    const hasMore = allNiches.length > initialVisibleCount;
    const visibleNiches = isExpanded ? allNiches : allNiches.slice(0, initialVisibleCount);
    const hiddenCount = allNiches.length - initialVisibleCount;

    return (
        <ul className="space-y-0.5 relative">
            {visibleNiches.map((niche, index) => {
                const isLastVisible = !isExpanded && hasMore && index === initialVisibleCount - 1;
                const isTrash = niche.id === 'TRASH';

                return (
                    <li key={niche.id} className={isLastVisible ? 'relative' : ''}>
                        {/* Add separator if this is the Trash item and it's not the only item */}
                        {isTrash && index > 0 && (
                            <div className="h-px bg-border mx-2 my-1" />
                        )}

                        <TrendNicheItem
                            niche={niche}
                            isActive={activeNicheIds.includes(niche.id)}
                            onClick={() => onNicheClick(isTrash ? 'TRASH' : niche.id)}
                            isTrash={isTrash}
                        />
                        {/* Fade overlay on last item when collapsed */}
                        {isLastVisible && (
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg-primary pointer-events-none" />
                        )}
                    </li>
                );
            })}

            {/* Expand/Collapse Button */}
            {hasMore && (
                <li>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] interactive-text"
                    >
                        <ChevronDown
                            size={12}
                            className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                        <span>
                            {isExpanded ? 'Show less' : `Show ${hiddenCount} more`}
                        </span>
                    </button>
                </li>
            )}
        </ul>
    );
};
