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
