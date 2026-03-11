export const formatViewCount = (viewCount: string | number | undefined): string => {
    if (!viewCount) return '';

    // If it's already formatted (contains M or K), return as is
    if (typeof viewCount === 'string' && /[MKmk]/.test(viewCount)) {
        return viewCount;
    }

    const num = typeof viewCount === 'string' ? parseInt(viewCount.replace(/,/g, ''), 10) : viewCount;

    if (isNaN(num)) return viewCount.toString();

    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 10000) {
        return Math.floor(num / 1000) + 'K';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
};

/**
 * Format a view delta value for display in badges.
 * Positive values get "+", negative get "−" (minus sign, not hyphen).
 * Values ≥1000 are abbreviated with K suffix.
 */
export const formatDelta = (value: number): string => {
    const abs = Math.abs(value);
    const formatted = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : String(abs);
    return value >= 0 ? formatted : `−${formatted}`;
};

/**
 * Get Tailwind color classes for a delta value badge.
 * Color reflects significance: |delta| / viewCount ratio.
 * >10% = emerald (strong growth), >5% = amber (notable), else = neutral gray.
 */
export const getDeltaColor = (delta: number, viewCount?: number): string => {
    if (viewCount && viewCount > 0) {
        const ratio = Math.abs(delta) / viewCount;
        if (ratio > 0.10) return 'text-emerald-400 bg-emerald-500/10';
        if (ratio > 0.05) return 'text-amber-400 bg-amber-500/10';
    }
    return 'text-text-primary bg-black/10 dark:bg-white/10';
};

export const formatDuration = (duration: string | undefined): string => {
    if (!duration) return '';

    // Handle ISO 8601 duration (PT1H2M10S)
    if (duration.startsWith('PT')) {
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        if (!match) return duration;

        const hours = (match[1] || '').replace('H', '');
        const minutes = (match[2] || '').replace('M', '');
        const seconds = (match[3] || '').replace('S', '');

        const parts = [];
        if (hours) {
            parts.push(hours);
            parts.push(minutes.padStart(2, '0') || '00');
        } else {
            parts.push(minutes || '0');
        }
        parts.push(seconds.padStart(2, '0') || '00');

        return parts.join(':');
    }

    // Return as is if it's already formatted (e.g. "10:05")
    return duration;
};
