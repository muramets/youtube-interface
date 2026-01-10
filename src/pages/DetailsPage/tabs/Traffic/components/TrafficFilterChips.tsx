import React from 'react';
import type { TrafficFilter } from '../hooks/useTrafficFilters';
import { FilterChips } from '../../../../../components/ui/molecules';

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

    return (
        <FilterChips
            items={chipItems}
            onClearAll={onClearAll}
            className="mb-4 px-1"
        />
    );
};
