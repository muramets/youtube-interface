import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { PERCENTILE_GROUPS, type PercentileGroup } from '../../../stores/trendStore';

interface FilterInputPercentileProps {
    initialExcluded?: PercentileGroup[];
    onApply: (excluded: PercentileGroup[]) => void;
}

export const FilterInputPercentile: React.FC<FilterInputPercentileProps> = ({
    initialExcluded = [],
    onApply
}) => {
    const [excludedGroups, setExcludedGroups] = useState<PercentileGroup[]>(initialExcluded);

    const toggleGroup = (group: PercentileGroup) => {
        setExcludedGroups(prev =>
            prev.includes(group)
                ? prev.filter(g => g !== group)
                : [...prev, group]
        );
    };

    const handleApply = () => {
        if (excludedGroups.length > 0) {
            onApply(excludedGroups);
        }
    };

    return (
        <div className="p-3 w-full bg-[#1F1F1F]">
            <div className="text-xs text-text-secondary mb-2">
                Select groups to hide:
            </div>

            <div className="flex flex-col gap-1">
                {PERCENTILE_GROUPS.map((group) => {
                    const isExcluded = excludedGroups.includes(group);
                    return (
                        <button
                            key={group}
                            onClick={() => toggleGroup(group)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between transition-colors border-none cursor-pointer
                                ${isExcluded
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-transparent text-text-primary hover:bg-[#333333]'
                                }`}
                        >
                            <span>{group}</span>
                            {isExcluded ? (
                                <X size={16} className="text-red-400" />
                            ) : (
                                <Check size={16} className="text-text-tertiary opacity-0 group-hover:opacity-50" />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="flex justify-end mt-3 pt-2 border-t border-[#333333]">
                <button
                    onClick={handleApply}
                    disabled={excludedGroups.length === 0}
                    className="bg-[#333333] text-white font-medium px-4 py-2 rounded-full text-sm hover:bg-[#444444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};
