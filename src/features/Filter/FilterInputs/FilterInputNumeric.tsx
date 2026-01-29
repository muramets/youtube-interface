
import React, { useState } from 'react';
import type { FilterOperator } from '../../../core/stores/filterStore';
import { CustomSelect } from '../../../components/ui/molecules/CustomSelect';
import { SmartDurationInput } from './SmartDurationInput';
import { SmartNumericInput } from './SmartNumericInput';
import { Checkbox } from '../../../components/ui/atoms/Checkbox/Checkbox';

interface FilterInputNumericProps {
    initialOperator?: FilterOperator;
    initialValue?: number;
    initialMaxValue?: number;
    onApply: (operator: FilterOperator, value: number, maxValue: number | undefined, isHideZero: boolean) => void;
    onRemove?: () => void;
    isDuration?: boolean;
    // New props for Quick Filter
    initialIsHideZero?: boolean;
    showHideZeroOption?: boolean;
    metricLabel?: string; // e.g. "Views", "Impressions"
}

export const FilterInputNumeric: React.FC<FilterInputNumericProps> = ({
    initialOperator = 'gte',
    initialValue,
    initialMaxValue,
    onApply,
    onRemove,
    isDuration,
    initialIsHideZero,
    showHideZeroOption,
    metricLabel
}) => {
    const [operator, setOperator] = useState<FilterOperator>(initialOperator);
    const [value, setValue] = useState<string | number>(initialValue !== undefined ? initialValue : '');
    const [maxValue, setMaxValue] = useState<string | number>(initialMaxValue !== undefined ? initialMaxValue : '');

    // Quick Filter Local State
    const [isHideZero, setIsHideZero] = useState(initialIsHideZero || false);

    const operators = [
        { label: '>=', value: 'gte' },
        { label: '<=', value: 'lte' },
        { label: '>', value: 'gt' },
        { label: '<', value: 'lt' },
        { label: '=', value: 'equals' },
        { label: 'Range', value: 'between' },
    ];

    const handleApply = () => {
        // Prepare numeric values
        let numValue = NaN;
        let numMax = undefined;

        if (value !== '') {
            numValue = Number(value);
        }

        if (operator === 'between' && maxValue !== '') {
            numMax = Number(maxValue);
        }

        // Apply if we have a valid numeric filter OR if we are handling the hide zero option
        // Note: Check for NaN in parent if you want to skip adding the numeric filter when empty
        onApply(operator, numValue, numMax, isHideZero);
    };

    const hasValidNumeric = value !== '' && !isNaN(Number(value)) && (operator !== 'between' || (maxValue !== '' && !isNaN(Number(maxValue))));

    // Dirty detection
    const hasChanges =
        operator !== initialOperator ||
        String(value) !== String(initialValue !== undefined ? initialValue : '') ||
        String(maxValue) !== String(initialMaxValue !== undefined ? initialMaxValue : '') ||
        isHideZero !== (initialIsHideZero || false);

    // Button label logic: 
    // If we are clearing an existing MAIN filter (value is empty, onRemove exists) AND not setting HideZero... it's a "Remove".
    // But if we are just changing HideZero, it's "Apply".
    // If value is empty, and we toggle HideZero, "Apply".
    const isRemoveAction = value === '' && onRemove && !isHideZero && !initialIsHideZero;

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
                    <div className={`${operator === 'between' ? 'w-[70px]' : 'w-full'} flex - shrink - 0 transition - all duration - 200`}>
                        {isDuration ? (
                            <SmartDurationInput
                                value={value as number}
                                onChange={(val) => setValue(val !== undefined ? val : '')}
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
                                        onChange={(val) => setMaxValue(val !== undefined ? val : '')}
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

            {showHideZeroOption && (
                <>
                    <div className="h-px bg-[#333333] w-full my-3" />
                    <div className="mb-3 px-1 flex items-center">
                        <Checkbox
                            checked={isHideZero}
                            onChange={() => setIsHideZero(!isHideZero)}
                            className="text-xs font-medium text-text-secondary group-hover:text-text-primary"
                        />
                        <span
                            className="ml-2 text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary"
                            onClick={() => setIsHideZero(!isHideZero)}
                        >
                            Hide 0 {metricLabel || ''}
                        </span>
                    </div>
                </>
            )}

            <div className="flex justify-end mt-2">
                <button
                    onClick={handleApply}
                    disabled={
                        !hasChanges ||
                        (!hasValidNumeric && !showHideZeroOption && !isRemoveAction) ||
                        (!hasValidNumeric && showHideZeroOption && !isHideZero && !initialIsHideZero && !isRemoveAction)
                    }
                    className="bg-[#333333] text-white font-medium px-4 py-2 rounded-full text-sm hover:bg-[#444444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isRemoveAction ? 'Remove' : 'Apply'}
                </button>
            </div>
        </div>
    );
};
