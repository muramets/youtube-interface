import React, { useState } from 'react';

export const SmartTimeInput: React.FC<{
    value: number | undefined;
    onSave: (newValue: number) => void;
    onCancel: () => void;
}> = ({ value, onSave, onCancel }) => {
    const formatInitialValue = (seconds?: number) => {
        if (seconds === undefined) return '';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        // If hours exist, we might want to support that, but for now let's stick to the requested format
        // Actually, let's use the same logic as the display formatter but maybe simplified
        if (m >= 60) {
            const h = Math.floor(m / 60);
            const remM = m % 60;
            return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const [inputValue, setInputValue] = useState(formatInitialValue(value));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = e.target.value.replace(/[^\d]/g, '');

        // Limit length to prevent overflow (e.g. HH:MM:SS is max 6 digits usually)
        if (raw.length > 6) raw = raw.slice(0, 6);

        let formatted = raw;
        if (raw.length > 2 && raw.length <= 4) {
            // MM:SS
            formatted = `${raw.slice(0, -2)}:${raw.slice(-2)}`;
        } else if (raw.length > 4) {
            // H:MM:SS
            formatted = `${raw.slice(0, -4)}:${raw.slice(-4, -2)}:${raw.slice(-2)}`;
        }

        setInputValue(formatted);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            save();
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    const save = () => {
        // Parse the formatted string back to seconds
        const parts = inputValue.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) {
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) {
            seconds = parts[0];
        }
        onSave(seconds);
    };

    return (
        <input
            autoFocus
            type="text"
            className="w-16 bg-[#1F1F1F] text-white text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none rounded text-xs"
            value={inputValue}
            onChange={handleChange}
            onBlur={save}
            onKeyDown={handleKeyDown}
        />
    );
};
