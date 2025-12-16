import React from 'react';
import { X } from 'lucide-react';
import { useTrendStore } from '../../../stores/trendStore';

export const TrendsFilterChips: React.FC = () => {
    const { trendsFilters, removeTrendsFilter } = useTrendStore();

    if (trendsFilters.length === 0) return null;

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {trendsFilters.map((filter) => (
                <div
                    key={filter.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-default"
                >
                    <span>{filter.label}</span>
                    <button
                        onClick={() => removeTrendsFilter(filter.id)}
                        className="p-0.5 rounded-full hover:text-red-500 transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};
