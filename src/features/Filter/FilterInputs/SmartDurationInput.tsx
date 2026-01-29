import React, { useState, useEffect, useCallback, memo } from 'react';

// --- Helper Functions (Pure) ---

/**
 * Converts a seconds value into a raw digit string for the input state.
 * e.g., 65 -> "0105" (1 minute, 05 seconds) -> displayed as "01:05"
 */
const secondsToDigits = (secs: number | undefined): string => {
    if (secs === undefined || Number.isNaN(secs) || secs === 0) return '';

    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;

    const hStr = h > 0 ? h.toString() : '';
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');

    if (h > 0) return `${hStr}${mStr}${sStr}`;
    if (m > 0) return `${parseInt(mStr, 10)}${sStr}`;
    return parseInt(sStr, 10).toString();
};

/**
 * Parses a raw digit string back into total seconds.
 */
function parseDigitsToSeconds(d: string): number {
    if (!d) return 0;
    const padded = d.padStart(6, '0');
    const h = parseInt(padded.slice(0, -4), 10);
    const m = parseInt(padded.slice(-4, -2), 10);
    const s = parseInt(padded.slice(-2), 10);
    return h * 3600 + m * 60 + s;
}

/**
 * Formats the raw digits for display (e.g., adds colons: 00:00).
 */
const formatDisplay = (d: string): string => {
    if (!d) return '';
    const val = parseInt(d, 10);
    if (Number.isNaN(val) || val === 0) return '';

    const clean = val.toString();

    // 1-2 digits: S or SS -> 00:SS
    if (clean.length <= 2) {
        return `00:${clean.padStart(2, '0')}`;
    }

    // 3-4 digits: M:SS or MM:SS
    if (clean.length <= 4) {
        const s = clean.slice(-2);
        const m = clean.slice(0, -2).padStart(2, '0');
        return `${m}:${s}`;
    }

    // 5-6 digits: H:MM:SS or HH:MM:SS
    if (clean.length <= 6) {
        const s = clean.slice(-2);
        const m = clean.slice(-4, -2);
        const h = clean.slice(0, -4).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    return clean;
};

// --- Component ---

interface SmartDurationInputProps {
    value?: number; // Value in seconds
    onChange: (seconds: number | undefined) => void;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
}

export const SmartDurationInput: React.FC<SmartDurationInputProps> = memo(({
    value,
    onChange,
    placeholder = 'Duration',
    autoFocus = false,
    className = ''
}) => {
    const [digits, setDigits] = useState<string>(() => secondsToDigits(value));

    // Sync with props if they change externally
    useEffect(() => {
        const currentSecondsFromDigits = parseDigitsToSeconds(digits);
        // Only update if the incoming value is different from what our current digits represent,
        // to avoid fighting with the user's typing.
        if (value !== undefined && value !== currentSecondsFromDigits) {
            setDigits(secondsToDigits(value));
        }
        // We strictly want to react to 'value' changes here.
        // 'digits' is intentionally omitted from dependencies to avoid loop, 
        // as we only care about external 'value' updates correcting our state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        // Strip non-digits
        let newDigits = raw.replace(/\D/g, '');

        // Strip leading zeros
        newDigits = newDigits.replace(/^0+/, '');

        // Cap length (6 digits for HHMMSS)
        if (newDigits.length > 6) return;

        // Check 24 hour limit (245959)
        if (newDigits.length === 6 && parseInt(newDigits, 10) > 245959) return;

        setDigits(newDigits);

        const seconds = parseDigitsToSeconds(newDigits);
        onChange(seconds > 0 ? seconds : undefined);
    }, [onChange]);

    return (
        <input
            type="text"
            className={`w-full bg-transparent border-b border-[#737373] focus:border-[#111111] py-1 text-white outline-none transition-colors text-base placeholder-[#555555] ${className}`}
            placeholder={placeholder}
            value={formatDisplay(digits)}
            onChange={handleChange}
            autoFocus={autoFocus}
            inputMode="numeric"
        />
    );
});

SmartDurationInput.displayName = 'SmartDurationInput';
