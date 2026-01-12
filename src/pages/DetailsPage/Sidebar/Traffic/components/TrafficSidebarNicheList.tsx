
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TrafficGroup } from '../../../../../core/types/traffic';
import { TrafficNicheItem } from '../../../../DetailsPage/tabs/Traffic/components/Niches/TrafficNicheItem';

interface TrafficSidebarNicheListProps {
    nicheImpressions: Record<string, number>;
    groups: TrafficGroup[]; // To get niche names and colors
    limit?: number;
    onNicheClick?: (nicheId: string) => void;
    activeNicheId?: string | null;
}

export const TrafficSidebarNicheList: React.FC<TrafficSidebarNicheListProps> = ({
    nicheImpressions,
    groups,
    limit = 5,
    onNicheClick,
    activeNicheId
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // Filter groups that have impressions
    const activeNiches = groups
        .filter(group => (nicheImpressions[group.id] || 0) > 0)
        .map(group => ({
            ...group,
            impressions: nicheImpressions[group.id] || 0
        }))
        .sort((a, b) => b.impressions - a.impressions); // Sort by impressions desc

    if (activeNiches.length === 0) return null;

    const visibleNiches = isExpanded ? activeNiches : activeNiches.slice(0, limit);
    const hiddenCount = activeNiches.length - limit;
    const hasMore = hiddenCount > 0;

    return (
        <ul className="space-y-0.5 mt-0.5">
            {visibleNiches.map(niche => (
                <li key={niche.id} className="relative">
                    <TrafficNicheItem
                        niche={{
                            id: niche.id,
                            name: niche.name,
                            color: niche.color,
                            property: niche.property,
                            channelId: '', // Passed via currentChannel context in store actions
                            createdAt: 0
                        }}
                        isActive={activeMenuId === niche.id}
                        onClick={() => {
                            if (onNicheClick) {
                                onNicheClick(niche.id);
                            }
                        }}
                        onToggleMenu={() => setActiveMenuId(activeMenuId === niche.id ? null : niche.id)}
                        onCloseMenu={() => setActiveMenuId(null)}
                        impressions={niche.impressions}
                        status="none"
                        isSelected={activeNicheId === niche.id}
                    />
                </li>
            ))}

            {/* Show More / Show Less Button */}
            {hasMore && (
                <li>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
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
