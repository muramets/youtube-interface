import React, { useMemo } from 'react';
import { useTrafficNicheStore } from '@/core/stores/useTrafficNicheStore';
import type { SuggestedTrafficNiche } from '@/core/types/suggestedTrafficNiches';
import { TrafficNicheItem } from './TrafficNicheItem';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';

interface TrafficSidebarNicheListProps {
    // We might filter niches relevant to the active snapshot later, 
    // but for now showing all channel niches is fine/simpler.
}

export const TrafficSidebarNicheList: React.FC<TrafficSidebarNicheListProps> = () => {
    const { niches } = useTrafficNicheStore();
    const [isExpanded, setIsExpanded] = React.useState(true);

    // TODO: Connect to filter logic
    // const [activeNicheId, setActiveNicheId] = React.useState<string | null>(null);

    const sortedNiches = useMemo(() => {
        return [...niches].sort((a, b) => a.name.localeCompare(b.name));
    }, [niches]);

    if (niches.length === 0) return null;

    return (
        <div className="mt-1">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors group"
            >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Hash size={14} className="text-text-tertiary" />
                <span>Niches</span>
                <span className="ml-auto text-[10px] text-text-tertiary">{niches.length}</span>
            </button>

            {isExpanded && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                    {sortedNiches.map(niche => (
                        <TrafficNicheItem
                            key={niche.id}
                            niche={niche}
                            isActive={false} // TODO: Check if active filter
                            onClick={() => {
                                // TODO: Apply filter
                                console.log('Click niche', niche.id);
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
