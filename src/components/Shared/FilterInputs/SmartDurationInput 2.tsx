import React, { useState, useEffect } from 'react';

interface SmartDurationInputProps {
    value?: number; // Value in seconds
    onChange: (seconds: number | undefined) => void;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string; // Additional classes for the input
}

export const SmartDurationInput: React.FC<SmartDurationInputProps> = ({
    value,
    onChange,
    placeholder = 'Duration',
    autoFocus,
    className
}) => {
    // We maintain rawDigits as the source of truth for user input.
    // e.g. "2" gives "00:02"
    // "20" gives "00:20"
    // "222" gives "02:22"
    // "222222" -> "22:22:22"

    // We also need to construct initial digits from `value` (seconds) if present.
    const secondsToDigits = (secs: number | undefined): string => {
        if (secs === undefined || isNaN(secs) || secs === 0) return '';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;

        let str = '';
        if (h > 0) {
            str += h.toString();
            str += m.toString().padStart(2, '0');
            str += s.toString().padStart(2, '0');
        } else {
            // If m > 0, we can omit H? 
            // Logic says if user enters 222 -> 02:22.
            // If we have seconds 142 (2:22) -> convert back to 222
            if (m > 0) {
                str += m.toString(); // e.g. 2
                str += s.toString().padStart(2, '0'); // 22
            } else {
                str += s.toString();
            }
        }
        // This is imperfect because reversing standard format to "what user typed" is lossy for leading zeros logic.
        // But for display we can just stick to standard formatting if not editing?
        // Let's try to maintain a consistent formatted view. 
        // Better: Convert seconds to HHMMSS string and strip leading zeros?

        // Actually, let's keep it simple: If prop updates, we overwrite our state.

        const hStr = h > 0 ? h.toString() : '';
        const mStr = m.toString().padStart(2, '0');
        const sStr = s.toString().padStart(2, '0');

        if (h > 0) return `${hStr}${mStr}${sStr}`;
        if (m > 0) return `${parseInt(mStr)}${sStr}`;
        return parseInt(sStr).toString();
    };

    const [digits, setDigits] = useState<string>(secondsToDigits(value));

    useEffect(() => {
        // Sync with props if they change externally (and aren't result of our own change)
        const currentSecondsFromDigits = parseDigitsToSeconds(digits);
        if (value !== undefined && value !== currentSecondsFromDigits) {
            setDigits(secondsToDigits(value));
        }
        if (value === undefined || value === 0) {
            // Check if we should clear
        }
    }, [value]);

    function parseDigitsToSeconds(d: string): number {
        if (!d) return 0;
        const padded = d.padStart(6, '0');
        const h = parseInt(padded.slice(0, -4));
        const m = parseInt(padded.slice(-4, -2));
        const s = parseInt(padded.slice(-2));
        return h * 3600 + m * 60 + s;
    }

    // Formatting logic for display (00:00 style) while typing
    const formatDisplay = (d: string): string => {
        if (!d) return '';
        const val = parseInt(d, 10);
        if (isNaN(val) || val === 0) return '';

        // Ensure strictly clean digits for length check just in case, though state should be clean
        const clean = val.toString();

        // 1-2 digits: S or SS -> 00:SS
        // e.g. 2 -> 00:02
        // e.g. 20 -> 00:20
        if (clean.length <= 2) {
            return `00:${clean.padStart(2, '0')}`;
        }

        // 3-4 digits: M:SS or MM:SS
        // e.g. 202 -> 02:02
        // e.g. 2022 -> 20:22
        if (clean.length <= 4) {
            const s = clean.slice(-2);
            const m = clean.slice(0, -2).padStart(2, '0');
            return `${m}:${s}`;
        }

        // 5-6 digits: H:MM:SS or HH:MM:SS
        // e.g. 20222 -> 2:02:22
        // e.g. 120222 -> 12:02:22
        if (clean.length <= 6) {
            const s = clean.slice(-2);
            const m = clean.slice(-4, -2);
            const h = clean.slice(0, -4).padStart(2, '0');
            return `${h}:${m}:${s}`;
        }

        return clean;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        // Strip non-digits
        let newDigits = raw.replace(/\D/g, '');

        // Strip leading zeros immediately to maintain the "push" feel
        // e.g. user sees "00:02", types 0 -> "00020" -> strip -> "20"
        newDigits = newDigits.replace(/^0+/, '');

        // Cap length to reasonable (6 digits for HHMMSS)
        if (newDigits.length > 6) return;

        // Check 24 hour limit (245959)
        if (newDigits.length === 6 && parseInt(newDigits) > 245959) return;

        setDigits(newDigits);

        // Convert digits to total seconds for the parent callback
        const seconds = parseDigitsToSeconds(newDigits);
        onChange(seconds > 0 ? seconds : undefined);
    };

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
};
