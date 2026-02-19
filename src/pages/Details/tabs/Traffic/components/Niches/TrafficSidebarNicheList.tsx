import React, { useMemo } from 'react';
import { useTrafficNicheStore } from '@/core/stores/trends/useTrafficNicheStore';
import type { TrafficSource } from '@/core/types/traffic';
import { TrafficNicheItem } from './TrafficNicheItem';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';

interface TrafficSidebarNicheListProps {
    sources: TrafficSource[]; // Currently displayed sources (already filtered by snapshot/version)
}

export const TrafficSidebarNicheList: React.FC<TrafficSidebarNicheListProps> = ({
    sources
}) => {
    const { niches, assignments } = useTrafficNicheStore();
    const [isExpanded, setIsExpanded] = React.useState(true);

    // Calculate impressions per niche from current sources
    const nicheStats = useMemo(() => {
        const stats = new Map<string, number>();

        // For each niche, sum impressions from assigned videos
        niches.forEach(niche => {
            // Find all video IDs assigned to this niche
            const assignedVideoIds = assignments
                .filter(a => a.nicheId === niche.id)
                .map(a => a.videoId);

            // Sum impressions from sources for these videos
            const totalImpressions = sources
                .filter(source => source.videoId && assignedVideoIds.includes(source.videoId))
                .reduce((sum: number, source: TrafficSource) => sum + (source.impressions || 0), 0);

            stats.set(niche.id, totalImpressions);
        });

        return stats;
    }, [niches, assignments, sources]);

    // Filter niches that have assigned videos in current sources
    const nichesWithData = useMemo(() => {
        return niches.filter(niche => {
            const impressions = nicheStats.get(niche.id) || 0;
            return impressions > 0;
        });
    }, [niches, nicheStats]);

    const sortedNiches = useMemo(() => {
        return [...nichesWithData].sort((a, b) => {
            // Sort by impressions descending, then by name
            const aImpr = nicheStats.get(a.id) || 0;
            const bImpr = nicheStats.get(b.id) || 0;
            if (aImpr !== bImpr) return bImpr - aImpr;
            return a.name.localeCompare(b.name);
        });
    }, [nichesWithData, nicheStats]);

    if (sortedNiches.length === 0) return null;

    return (
        <div className="mt-1">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors group"
            >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Hash size={14} className="text-text-tertiary" />
                <span>Niches</span>
                <span className="ml-auto text-[10px] text-text-tertiary">{sortedNiches.length}</span>
            </button>

            {isExpanded && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                    {sortedNiches.map(niche => (
                        <TrafficNicheItem
                            key={niche.id}
                            niche={niche}
                            isActive={false}
                            onClick={() => {
                                // TODO: Apply filter
                            }}
                            impressions={nicheStats.get(niche.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
