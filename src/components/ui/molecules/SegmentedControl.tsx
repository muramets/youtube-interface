import React, { useMemo } from 'react';

export interface SegmentedControlOption<T extends string | number> {
    value: T;
    label: string;
    disabled?: boolean;
}

interface SegmentedControlProps<T extends string | number> {
    options: SegmentedControlOption<T>[];
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
    className?: string;
}

export const SegmentedControl = <T extends string | number>({
    options,
    value,
    onChange,
    disabled = false,
    className = ''
}: SegmentedControlProps<T>) => {

    // Calculate position for the sliding indicator
    const selectedIndex = useMemo(() => options.findIndex(o => o.value === value), [options, value]);

    // Calculate percentage width for each item
    const itemWidthPercent = 100 / options.length;

    // Calculate left position: index * width% + minimal spacing adjustment if needed
    // The original logic used hardcoded pixels or calcs. Here we can use simple percentage for the slider if flex-1 is used.
    // However, to match the "gap-0" look with padding, let's replicate the original style carefully.
    // Original: absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] ... left: value ? '2px' : 'calc(50% + 0px)'

    // We'll generalize this for N items.
    // We assume equal width items.
    // width = `calc(${100/N}% - 4px)` roughly? 
    // Let's rely on standard percentage math.
    // If N=2: width 50%.

    return (
        <div className={`relative flex bg-[#1a1a1a] rounded-lg p-0.5 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
            {/* Sliding Indicator */}
            <div
                className="absolute top-0.5 bottom-0.5 bg-gradient-to-r from-[#2d2d2d] to-[#333333] rounded-md shadow-sm transition-all duration-200 ease-out"
                style={{
                    width: `calc(${itemWidthPercent}% - 4px)`, // Subtract padding/gap space
                    left: `calc(${selectedIndex * itemWidthPercent}% + 2px)`
                }}
            />

            {options.map((option) => (
                <button
                    key={option.value}
                    onClick={() => !disabled && !option.disabled && onChange(option.value)}
                    disabled={disabled || option.disabled}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors duration-200 border-none bg-transparent ${disabled || option.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                        } ${value === option.value
                            ? 'text-text-primary'
                            : 'text-text-tertiary hover:text-text-secondary'
                        }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
};
