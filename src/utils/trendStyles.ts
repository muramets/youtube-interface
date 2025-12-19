export const DOT_STYLES = {
    'Top 1%': { colorHex: '#10b981', tailwindColor: 'bg-emerald-500', size: 96 },
    'Top 5%': { colorHex: '#84cc16', tailwindColor: 'bg-lime-500', size: 80 },
    'Top 20%': { colorHex: '#3b82f6', tailwindColor: 'bg-blue-500', size: 64 },
    'Middle 60%': { colorHex: '#c084fc', tailwindColor: 'bg-purple-400', size: 48 },
    'Bottom 20%': { colorHex: '#f87171', tailwindColor: 'bg-red-400', size: 40 },
    'default': { colorHex: '#9ca3af', tailwindColor: 'bg-gray-400', size: 40 }
} as const;

export type PercentileGroup = keyof typeof DOT_STYLES;

export const getDotStyle = (percentileGroup: string | undefined) => {
    const key = (percentileGroup && percentileGroup in DOT_STYLES) 
        ? (percentileGroup as PercentileGroup) 
        : 'default';
    return DOT_STYLES[key];
};
