import React, { useState, useEffect } from 'react';

interface SmartNumericInputProps {
    value: number | string;
    onChange: (value: string | number) => void;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
}

export const SmartNumericInput: React.FC<SmartNumericInputProps> = ({
    value,
    onChange,
    placeholder,
    autoFocus,
    className = ''
}) => {
    // Internal state stores the formatted string
    const [displayValue, setDisplayValue] = useState('');

    // Update display when external value changes
    useEffect(() => {
        if (value === '' || value === undefined || value === null) {
            setDisplayValue('');
        } else {
            // Format existing number with commas
            const num = Number(value);
            if (!isNaN(num)) {
                setDisplayValue(num.toLocaleString('en-US'));
            } else {
                setDisplayValue(String(value));
            }
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputVal = e.target.value;

        // Allow clearing
        if (inputVal === '') {
            setDisplayValue('');
            onChange('');
            return;
        }

        // Remove commas to get raw number string (e.g. "1,234" -> "1234")
        const rawValue = inputVal.replace(/,/g, '');

        // Validate: must be digits only
        if (/^\d*$/.test(rawValue)) {
            const num = Number(rawValue);

            // Update display with formatted version
            // Note: We use the raw inputVal for the *current* change to avoid
            // cursor jumping issues if we re-format aggressively, 
            // BUT for this specific "Smart" requirement, we usually want auto-formatting.
            // Let's formatting on the fly.

            const formatted = num.toLocaleString('en-US');
            setDisplayValue(formatted);
            onChange(num);
        }
    };

    return (
        <input
            type="text"
            className={`bg-transparent border-b border-[#737373] focus:border-[#111111] py-1 text-white outline-none transition-colors text-base text-center placeholder-[#555555] ${className}`}
            placeholder={placeholder}
            value={displayValue}
            onChange={handleChange}
            autoFocus={autoFocus}
            inputMode="numeric"
        />
    );
};
