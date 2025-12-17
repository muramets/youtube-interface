import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TrendNiche } from '../../../types/trends';
import { TrendNicheItem } from './TrendNicheItem';

interface CollapsibleNicheListProps {
    niches: TrendNiche[];
    activeNicheId: string | null;
    onNicheClick: (id: string | null) => void;
    initialVisibleCount?: number;
}

export const CollapsibleNicheList: React.FC<CollapsibleNicheListProps> = ({
    niches,
    activeNicheId,
    onNicheClick,
    initialVisibleCount = 5
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const hasMore = niches.length > initialVisibleCount;
    const visibleNiches = isExpanded ? niches : niches.slice(0, initialVisibleCount);
    const hiddenCount = niches.length - initialVisibleCount;

    if (niches.length === 0) return null;

    return (
        <ul className="space-y-0.5 relative">
            {visibleNiches.map((niche, index) => {
                const isLastVisible = !isExpanded && hasMore && index === initialVisibleCount - 1;
                return (
                    <li key={niche.id} className={isLastVisible ? 'relative' : ''}>
                        <TrendNicheItem
                            niche={niche}
                            isActive={activeNicheId === niche.id}
                            onClick={onNicheClick}
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
