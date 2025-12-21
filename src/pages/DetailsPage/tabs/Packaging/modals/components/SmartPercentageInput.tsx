import React from 'react';

interface SmartPercentageInputProps {
    value: number;
    onChange: (value: number) => void;
    max?: number;
    borderClassName?: string;
}

/**
 * Percentage input with smart formatting:
 * - Strips non-digits
 * - Auto-converts 3-digit inputs (e.g., 222 → 22.2, but 100 → 100)
 * - Clamps to max value
 */
export const SmartPercentageInput: React.FC<SmartPercentageInputProps> = ({
    value,
    onChange,
    max = 100,
    borderClassName = 'border-[#3F3F3F]'
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove non-digits
        let raw = e.target.value.replace(/[^\d]/g, '');

        // Limit to 3 digits
        if (raw.length > 3) {
            raw = raw.slice(0, 3);
        }

        if (!raw) {
            onChange(0);
            return;
        }

        let numVal = parseInt(raw, 10);

        // Formatting logic: 222 -> 22.2, but 100 -> 100
        if (raw.length === 3 && numVal !== 100) {
            numVal = numVal / 10;
        }

        // Clamp to max
        if (numVal > max) {
            numVal = max;
        }

        onChange(numVal);
    };

    return (
        <div className="relative w-full">
            <input
                type="text"
                inputMode="decimal"
                value={value > 0 ? value : ''}
                onChange={handleChange}
                className={`w-full bg-modal-input-bg text-modal-text-primary text-right text-sm font-medium p-2 pr-7 rounded-lg border focus:border-[#3ea6ff] outline-none transition-colors ${borderClassName}`}
                placeholder="0"
                style={{ appearance: 'none' }}
                disabled={max <= 0 && value === 0}
            />
            <style>{`
                input[type="text"] {
                    -moz-appearance: textfield;
                }
                input::-webkit-outer-spin-button,
                input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
            `}</style>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none text-text-secondary">%</span>
        </div>
    );
};
