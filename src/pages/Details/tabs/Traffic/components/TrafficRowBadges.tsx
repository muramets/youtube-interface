import React from 'react';
import { TrendingUp } from 'lucide-react';

import type { SuggestedTrafficNiche } from '@/core/types/suggestedTrafficNiches';

import { Badge } from '@/components/ui/atoms/Badge/Badge';
import { PortalTooltip } from '@/components/ui/atoms/PortalTooltip';

interface TrafficRowBadgesProps {
    niches: SuggestedTrafficNiche[]; // Niches assigned to this video (Confirmed)
    suggested?: SuggestedTrafficNiche; // Smart Suggestion (Ghost)
    isTrendsSuggestion?: boolean; // True if suggestion comes from Trends tab
    onConfirmSuggestion?: (niche: SuggestedTrafficNiche) => void;
}

export const TrafficRowBadges: React.FC<TrafficRowBadgesProps> = ({
    niches,
    suggested,
    isTrendsSuggestion = false,
    onConfirmSuggestion
}) => {
    // Determine which niches to show
    // If we have assigned niches, show them.
    // If not, and we have a suggestion, show that.
    const hasAssignments = niches && niches.length > 0;

    // Scenario 1: Real Assignments
    if (hasAssignments) {
        const sortedNiches = [...niches].sort((a, b) => a.name.localeCompare(b.name));
        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                {sortedNiches.map(niche => (
                    <Badge
                        key={niche.id}
                        color={niche.color}
                        className="!px-1.5 !py-0.5"
                        maxWidth="120px"
                    >
                        {niche.name}
                    </Badge>
                ))}
            </div>
        );
    }

    // Scenario 2: Smart Suggestion (Ghost Badge)
    if (suggested) {
        const tooltipContent = isTrendsSuggestion
            ? `From Trends: ${suggested.name} (Click to add)`
            : `Suggested: ${suggested.name} (Click to Confirm)`;

        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                <PortalTooltip content={tooltipContent} enterDelay={200}>
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            onConfirmSuggestion?.(suggested);
                        }}
                    >
                        <Badge
                            key={suggested.id}
                            color={suggested.color}
                            className={`
                                !px-1.5 !py-0.5 !opacity-50 hover:!opacity-100 
                                transition-opacity cursor-pointer border-dashed border-white/40
                                ${isTrendsSuggestion ? '!pl-1' : ''}
                            `}
                            disableTooltip={true} // Disable internal tooltip because we wrap it in PortalTooltip
                            maxWidth="120px"
                        >
                            <span className="flex items-center gap-1 min-w-0">
                                {isTrendsSuggestion && (
                                    <TrendingUp size={10} className="flex-shrink-0" />
                                )}
                                <span className="truncate">{suggested.name}</span>
                            </span>
                        </Badge>
                    </div>
                </PortalTooltip>
            </div>
        );
    }

    return null;
};
