import React from 'react';
import { X } from 'lucide-react';

export interface FilterChipItem {
    id: string;
    label: string;
    onRemove: () => void;
}

interface FilterChipsProps {
    items: FilterChipItem[];
    onClearAll?: () => void;
    className?: string;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
    items,
    onClearAll,
    className = ''
}) => {
    if (items.length === 0) return null;

    return (
        <div className={`flex items-center gap-2 flex-wrap ${className}`}>
            {items.map((item) => (
                <div
                    key={item.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-default"
                >
                    <span>{item.label}</span>
                    <button
                        onClick={item.onRemove}
                        className="p-0.5 rounded-full hover:text-red-500 transition-colors"
                        type="button"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}

            {onClearAll && items.length > 1 && (
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
