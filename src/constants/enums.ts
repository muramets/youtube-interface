export const FilterType = {
    ALL: 'all',
    CHANNEL: 'channel',
    PLAYLISTS: 'playlists',
} as const;

export type FilterType = typeof FilterType[keyof typeof FilterType];

export const SortOption = {
    DEFAULT: 'default',
    VIEWS: 'views',
    DATE: 'date',
} as const;

export type SortOption = typeof SortOption[keyof typeof SortOption];

export const Theme = {
    LIGHT: 'light',
    DARK: 'dark',
} as const;

export type Theme = typeof Theme[keyof typeof Theme];

export const ViewMode = {
    GRID: 'grid',
    LIST: 'list',
} as const;

export type ViewMode = typeof ViewMode[keyof typeof ViewMode];
