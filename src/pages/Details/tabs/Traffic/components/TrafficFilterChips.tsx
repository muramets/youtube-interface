import React from 'react';
import type { TrafficFilter } from '../hooks/useTrafficFilters';
import { FilterChips } from '../../../../../components/ui/molecules';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { RotateCcw } from 'lucide-react';

interface TrafficFilterChipsProps {
    filters: TrafficFilter[];
    onRemoveFilter: (id: string) => void;
    onClearAll: () => void;
}

export const TrafficFilterChips: React.FC<TrafficFilterChipsProps> = ({
    filters,
    onRemoveFilter,
    onClearAll
}) => {
    // Transform domain filters to UI chip items
    const chipItems = filters.map(filter => ({
        id: filter.id,
        label: filter.label,
        onRemove: () => onRemoveFilter(filter.id)
    }));

    // Custom Clear All button with tooltip
    const clearAllButton = (
        <PortalTooltip content="Clear all filters" side="bottom" align="center">
            <button
                onClick={onClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                type="button"
            >
                <RotateCcw size={14} />
            </button>
        </PortalTooltip>
    );

    return (
        <FilterChips
            items={chipItems}
            onClearAll={onClearAll}
            className="mb-4 px-1"
            chipClassName="bg-sidebar-active"
            clearAllButton={clearAllButton}
        />
    );
};
