// =============================================================================
// Unit conversion utilities for Settings frequency/duration inputs
// =============================================================================

export type FrequencyUnit = 'Minutes' | 'Hours' | 'Days' | 'Weeks';
export type DurationUnit = 'Seconds' | 'Minutes' | 'Hours';

// --- Hours-based (Sync frequency) ---

export const getFrequencyUnit = (hours: number): FrequencyUnit => {
    if (hours % 168 === 0 && hours >= 168) return 'Weeks';
    if (hours % 24 === 0 && hours >= 24) return 'Days';
    if (hours >= 1 && Number.isInteger(hours)) return 'Hours';
    return 'Minutes';
};

export const getFrequencyValue = (hours: number, unit: FrequencyUnit): number => {
    if (unit === 'Weeks') return hours / 168;
    if (unit === 'Days') return hours / 24;
    if (unit === 'Minutes') return Math.round(hours * 60);
    return hours;
};

export const frequencyToHours = (value: number, unit: FrequencyUnit): number => {
    if (unit === 'Weeks') return value * 168;
    if (unit === 'Days') return value * 24;
    if (unit === 'Minutes') return value / 60;
    return value;
};

// --- Seconds-based (Clone duration) ---

export const getDurationUnit = (seconds: number): DurationUnit => {
    if (seconds % 3600 === 0) return 'Hours';
    if (seconds % 60 === 0) return 'Minutes';
    return 'Seconds';
};

export const getDurationValue = (seconds: number, unit: DurationUnit): number => {
    if (unit === 'Hours') return seconds / 3600;
    if (unit === 'Minutes') return seconds / 60;
    return seconds;
};

export const durationToSeconds = (value: number, unit: DurationUnit): number => {
    if (unit === 'Hours') return value * 3600;
    if (unit === 'Minutes') return value * 60;
    return value;
};
