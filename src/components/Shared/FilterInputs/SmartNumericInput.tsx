import React from 'react';

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
    // Derived display value from props
    // We format immediately to match previous behavior
    const getDisplayValue = () => {
        if (value === '' || value === undefined || value === null) return '';
        const num = Number(value);
        return isNaN(num) ? String(value) : num.toLocaleString('en-US');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputVal = e.target.value;

        // Allow clearing
        if (inputVal === '') {
            onChange('');
            return;
        }

        // Remove commas to get raw number string
        const rawValue = inputVal.replace(/,/g, '');

        // Validate: must be digits only
        if (/^\d*$/.test(rawValue)) {
            const num = Number(rawValue);
            onChange(num);
        }
    };

    return (
        <input
            type="text"
            className={`bg-transparent border-b border-[#737373] focus:border-[#111111] py-1 text-white outline-none transition-colors text-base text-center placeholder-[#555555] ${className}`}
            placeholder={placeholder}
            value={getDisplayValue()}
            onChange={handleChange}
            autoFocus={autoFocus}
            inputMode="numeric"
        />
    );
};
