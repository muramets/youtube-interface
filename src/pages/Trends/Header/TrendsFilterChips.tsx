import React from 'react';
import { X } from 'lucide-react';
import { useTrendStore } from '../../../core/stores/trends/trendStore';

export const TrendsFilterChips: React.FC = () => {
    const { trendsFilters, removeTrendsFilter, addTrendsFilter } = useTrendStore();

    if (trendsFilters.length === 0) return null;

    // Handle removing a single percentile group from a filter
    const handleRemovePercentileGroup = (filterId: string, groupToRemove: string, allGroups: string[]) => {
        const remaining = allGroups.filter(g => g !== groupToRemove);
        // Remove old filter
        removeTrendsFilter(filterId);
        // Add updated filter if groups remain
        if (remaining.length > 0) {
            const label = remaining.length === 1
                ? `Hide: ${remaining[0]}`
                : `Hide: ${remaining.length} groups`;
            addTrendsFilter({ type: 'percentile', operator: 'equals', value: remaining, label });
        }
    };

    // Expand percentile filters into individual chips
    const chips: { key: string; label: string; onRemove: () => void }[] = [];

    trendsFilters.forEach(filter => {
        // Skip display for Untracked (Trash Mode) niche filter
        if (filter.type === 'niche' && Array.isArray(filter.value) && (filter.value as string[]).includes('TRASH')) {
            return;
        }

        if (filter.type === 'percentile' && Array.isArray(filter.value)) {
            // Create a chip for each excluded group
            (filter.value as string[]).forEach((group: string) => {
                chips.push({
                    key: `${filter.id}-${group}`,
                    label: `Hide: ${group}`,
                    onRemove: () => handleRemovePercentileGroup(filter.id, group, filter.value as string[])
                });
            });
        } else {
            // Regular filter chip
            chips.push({
                key: filter.id,
                label: filter.label,
                onRemove: () => removeTrendsFilter(filter.id)
            });
        }
    });

    if (chips.length === 0) return null;

    return (
        <div className="relative flex-1 min-w-0">
            {/* Scrollable chips container with hidden scrollbar */}
            <div
                className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
                style={{
                    maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent 100%)',
                    paddingRight: '24px' // Space for fade
                }}
            >
                {chips.map((chip) => (
                    <div
                        key={chip.key}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-default flex-shrink-0"
                    >
                        <span className="whitespace-nowrap">{chip.label}</span>
                        <button
                            onClick={chip.onRemove}
                            className="p-0.5 rounded-full hover:text-red-500 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
