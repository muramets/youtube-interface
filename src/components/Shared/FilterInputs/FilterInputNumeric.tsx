import React, { useState } from 'react';
import type { FilterOperator } from '../../../core/stores/filterStore';
import { CustomSelect } from '../CustomSelect';
import { SmartDurationInput } from './SmartDurationInput';
import { SmartNumericInput } from './SmartNumericInput';

interface FilterInputNumericProps {
    initialOperator?: FilterOperator;
    initialValue?: number;
    initialMaxValue?: number;
    onApply: (operator: FilterOperator, value: number, maxValue?: number) => void;
    onRemove?: () => void;
    isDuration?: boolean;
}

export const FilterInputNumeric: React.FC<FilterInputNumericProps> = ({
    initialOperator = 'gte',
    initialValue,
    initialMaxValue,
    onApply,
    onRemove,
    isDuration
}) => {
    const [operator, setOperator] = useState<FilterOperator>(initialOperator);

    // For numeric inputs (views), value is string. For duration, we track seconds (number) but SmartDurationInput manages display.
    // We'll sync local state.
    const [value, setValue] = useState<string | number>(initialValue || '');
    const [maxValue, setMaxValue] = useState<string | number>(initialMaxValue || '');

    const operators = [
        { label: '>=', value: 'gte' },
        { label: '<=', value: 'lte' },
        { label: '>', value: 'gt' },
        { label: '<', value: 'lt' },
        { label: '=', value: 'equals' },
        { label: 'Range', value: 'between' },
    ];

    const handleApply = () => {
        // If empty and onRemove exists, trigger remove
        if (value === '' && onRemove) {
            onRemove();
            return;
        }

        const numValue = Number(value);
        if (isNaN(numValue) || value === '') return;

        let numMax = undefined;
        if (operator === 'between') {
            numMax = Number(maxValue);
            if (isNaN(numMax) || maxValue === '') return;
        }

        onApply(operator, numValue, numMax);
    };

    return (
        <div className="p-3 w-full bg-[#1F1F1F]">
            {/* Horizontal Layout with Fixed Parent Width */}
            <div className="flex items-center gap-2 mb-2 w-full">
                {/* Operator - Compact 70px */}
                <div className="w-[70px] flex-shrink-0">
                    <CustomSelect
                        options={operators}
                        value={operator}
                        onChange={(val) => setOperator(val as FilterOperator)}
                        className="w-full text-center"
                    />
                </div>

                {/* Input Area - Expands to fill remaining space */}
                <div className="flex-1 flex items-center gap-2 justify-between">
                    {/* Input 1 - Expands if single, fixed if range */}
                    <div className={`${operator === 'between' ? 'w-[70px]' : 'w-full'} flex-shrink-0 transition-all duration-200`}>
                        {isDuration ? (
                            <SmartDurationInput
                                value={value as number}
                                onChange={(val) => setValue(val || '')}
                                placeholder="Value"
                                autoFocus
                                className="text-center w-full"
                            />
                        ) : (
                            <SmartNumericInput
                                value={value}
                                onChange={(val) => setValue(val)}
                                placeholder="Value"
                                autoFocus
                                className="w-full text-center"
                            />
                        )}
                    </div>

                    {/* Range Separator & Input 2 */}
                    {operator === 'between' && (
                        <>
                            <div className="text-[#AAAAAA] flex-shrink-0">-</div>
                            <div className="w-[70px] flex-shrink-0">
                                {isDuration ? (
                                    <SmartDurationInput
                                        value={maxValue as number}
                                        onChange={(val) => setMaxValue(val || '')}
                                        placeholder="Max"
                                        className="text-center w-full"
                                    />
                                ) : (
                                    <SmartNumericInput
                                        value={maxValue}
                                        onChange={(val) => setMaxValue(val)}
                                        placeholder="Max"
                                        className="w-full text-center"
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="flex justify-end mt-2">
                <button
                    onClick={handleApply}
                    // Disable if invalid AND (no remove handler OR value is not empty)
                    // Basically: Enable if valid OR (empty and hasRemove)
                    disabled={!onRemove && (value === '' || (operator === 'between' && maxValue === ''))}
                    className="bg-[#333333] text-white font-medium px-4 py-2 rounded-full text-sm hover:bg-[#444444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {value === '' && onRemove ? 'Remove' : 'Apply'}
                </button>
            </div>
        </div>
    );
};
