import React from 'react';
import { X } from 'lucide-react';
import type { TrafficFilter } from '../hooks/useTrafficFilters';

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
    if (filters.length === 0) return null;

    return (
        <div className="flex items-center gap-2 flex-wrap mb-4 px-1">
            {filters.map((filter) => (
                <div
                    key={filter.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary text-xs font-medium text-text-primary border border-white/5 hover:bg-hover-bg transition-colors cursor-default"
                >
                    <span>{filter.label}</span>
                    <button
                        onClick={() => onRemoveFilter(filter.id)}
                        className="p-0.5 rounded-full hover:text-red-500 transition-colors cursor-pointer"
                        title="Remove filter"
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}

            {filters.length > 1 && (
                <button
                    onClick={onClearAll}
                    className="text-xs text-text-secondary hover:text-text-primary ml-1 transition-colors"
                >
                    Clear all
                </button>
            )}
        </div>
    );
};
