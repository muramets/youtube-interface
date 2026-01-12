import React from 'react';

import type { SuggestedTrafficNiche } from '@/core/types/suggestedTrafficNiches';

import { Badge } from '@/components/ui/atoms/Badge/Badge';

interface TrafficRowBadgesProps {
    niches: SuggestedTrafficNiche[]; // Niches assigned to this video
}

export const TrafficRowBadges: React.FC<TrafficRowBadgesProps> = ({ niches }) => {
    if (!niches || niches.length === 0) return null;

    // Sort by creation or name? Name seems fine.
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
};
