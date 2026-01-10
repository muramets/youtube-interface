import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../Shared/Tooltip';

export interface FilterChipItem {
    id: string;
    label: string;
    onRemove: () => void;
}

interface FilterChipsProps {
    items: FilterChipItem[];
    onClearAll?: () => void;
    className?: string; // Container class
    chipClassName?: string; // Individual chip class
}

export const FilterChips: React.FC<FilterChipsProps> = ({
    items,
    onClearAll,
    className = '',
    chipClassName = 'bg-bg-secondary'
}) => {
    if (items.length === 0) return null;

    return (
        <TooltipProvider>
            <div className={`flex items-center gap-2 flex-wrap ${onClearAll && items.length > 1 ? 'justify-between' : ''} ${className}`}>
                <div className="flex items-center gap-2 flex-wrap">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-default ${chipClassName}`}
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
                </div>

                {onClearAll && items.length > 1 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={onClearAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                type="button"
                            >
                                <RotateCcw size={14} />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Clear all filters</p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </TooltipProvider>
    );
};
