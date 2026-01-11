import React from 'react';
import { ThumbsDown, Target } from 'lucide-react';
import type { SuggestedTrafficNiche } from '../../../../../../core/types/suggestedTrafficNiches';

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
                <div
                    key={niche.id}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5 border border-white/5"
                    style={{ borderColor: `${niche.color}40`, backgroundColor: `${niche.color}10` }}
                >
                    {/* Property Icon */}
                    {niche.property === 'unrelated' && (
                        <ThumbsDown size={10} className="text-amber-700/80" />
                    )}
                    {niche.property === 'targeted' && (
                        <Target size={10} className="text-yellow-500" />
                    )}
                    {niche.property === 'desired' && (
                        <Target size={10} className="text-blue-500" />
                    )}

                    {/* Niche Name */}
                    <span
                        className="text-[10px] font-medium leading-none max-w-[100px] truncate"
                        style={{ color: niche.color }}
                    >
                        {niche.name}
                    </span>
                </div>
            ))}
        </div>
    );
};
