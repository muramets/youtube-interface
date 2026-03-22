// =============================================================================
// Shared types for Settings feature
// =============================================================================

export interface SettingsTheme {
    isDark: boolean;
    textSecondary: string;
    textPrimary: string;
    borderColor: string;
    bgMain: string;
    hoverBg?: string;
    activeItemBg?: string;
    activeItemText?: string;
}

// Shared CSS class constants for Settings inputs/dropdowns
export const SETTINGS_STYLES = {
    inputBg: 'bg-[var(--settings-input-bg)]',
    inputBorder: 'border-border',
    hoverBorder: 'hover:border-text-secondary',
    focusBorder: 'focus:border-text-primary',
    dropdownBg: 'bg-[var(--settings-dropdown-bg)]',
    dropdownHover: 'hover:bg-[var(--settings-dropdown-hover)]',
} as const;
