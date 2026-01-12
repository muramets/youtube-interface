import React from 'react';

import type { SuggestedTrafficNiche } from '@/core/types/suggestedTrafficNiches';

import { Badge } from '@/components/ui/atoms/Badge/Badge';

interface TrafficRowBadgesProps {
    niches: SuggestedTrafficNiche[]; // Niches assigned to this video (Confirmed)
    suggested?: SuggestedTrafficNiche; // Smart Suggestion (Ghost)
    onConfirmSuggestion?: (niche: SuggestedTrafficNiche) => void;
}

export const TrafficRowBadges: React.FC<TrafficRowBadgesProps> = ({ niches, suggested, onConfirmSuggestion }) => {
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
        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        onConfirmSuggestion?.(suggested);
                    }}
                    title="Suggested by Assistant (Click to Confirm)"
                >
                    <Badge
                        key={suggested.id}
                        color={suggested.color}
                        className="!px-1.5 !py-0.5 !opacity-50 hover:!opacity-100 transition-opacity cursor-pointer border-dashed border-white/40"
                        maxWidth="120px"
                    >
                        {suggested.name}
                    </Badge>
                </div>
            </div>
        );
    }

    return null;
};
