import React from 'react';
import { X, Pin } from 'lucide-react';
import { useTrendStore } from '../../../core/stores/trends/trendStore';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';

interface TrendsFilterChipsProps {
    isAppliedFromAllChannels?: boolean;
    onSaveForChannel?: () => void;
    onClearApplied?: () => void;
}

export const TrendsFilterChips: React.FC<TrendsFilterChipsProps> = ({
    isAppliedFromAllChannels = false,
    onSaveForChannel,
    onClearApplied
}) => {
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

    // Handle chip removal — if this was the last inherited filter, clear the banner state
    const handleChipRemove = (removeAction: () => void) => {
        removeAction();
        // Read fresh state after mutation (closure value is stale)
        const currentCount = useTrendStore.getState().trendsFilters.length;
        if (isAppliedFromAllChannels && currentCount === 0) {
            onClearApplied?.();
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

    // Tooltip content for inherited chips — interactive with pin button
    const tooltipContent = (
        <div className="flex items-center gap-2">
            <span>Applied from All Channels</span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onSaveForChannel?.();
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-hover-bg hover:bg-border transition-colors cursor-pointer border-none text-text-primary text-[11px]"
            >
                <Pin size={10} />
                <span>Save</span>
            </button>
        </div>
    );

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
                {chips.map((chip) => {
                    const chipElement = (
                        <div
                            key={chip.key}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-text-primary transition-colors cursor-default flex-shrink-0 bg-bg-secondary hover:bg-hover-bg ${isAppliedFromAllChannels
                                ? 'border border-dashed border-text-secondary'
                                : ''
                                }`}
                        >
                            <span className="whitespace-nowrap">{chip.label}</span>
                            <button
                                onClick={() => handleChipRemove(chip.onRemove)}
                                className="p-0.5 rounded-full hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );

                    // Wrap in tooltip only when inherited
                    if (isAppliedFromAllChannels) {
                        return (
                            <PortalTooltip
                                key={chip.key}
                                content={tooltipContent}
                                side="bottom"
                                align="center"
                            >
                                {chipElement}
                            </PortalTooltip>
                        );
                    }

                    return chipElement;
                })}
            </div>
        </div>
    );
};
