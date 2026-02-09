import React from 'react';
import type { PickerSettings } from '../../core/services/settingsService';

interface ThemeProps {
    isDark: boolean;
    textSecondary: string;
    borderColor?: string;
    bgMain?: string;
    textPrimary?: string;
}

interface PickerSettingsViewProps {
    settings: PickerSettings;
    onChange: (s: PickerSettings) => void;
    theme: ThemeProps;
}

export const PickerSettingsView: React.FC<PickerSettingsViewProps> = ({ settings, onChange, theme }) => {
    const inputBg = 'bg-[var(--settings-input-bg)]';
    const inputBorder = 'border-border';
    const focusBorder = 'focus:border-text-primary';

    return (
        <div className="space-y-8 animate-fade-in max-w-[600px]">
            <section className="space-y-1">
                <h3 className="text-base font-medium">Pick the Winner</h3>
                <p className={`text-sm ${theme.textSecondary}`}>
                    Configure the "Pick the Winner" ranking mode for playlists.
                </p>
            </section>

            <div className={`border ${theme.borderColor} rounded-md p-4`}>
                <label className={`block text-xs ${theme.textSecondary} mb-2`}>Winner Count</label>
                <p className={`text-sm ${theme.textSecondary} mb-3`}>
                    Number of top-ranked videos to keep when using "Hide Losers" or "Delete Losers".
                </p>
                <div className="w-24">
                    <input
                        type="number"
                        min={1}
                        max={50}
                        value={settings.winnerCount}
                        onChange={(e) => {
                            const val = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
                            onChange({ ...settings, winnerCount: val });
                        }}
                        className={`w-full ${inputBg} border ${inputBorder} rounded-md px-3 py-2 focus:outline-none ${focusBorder} transition-colors no-spinner`}
                    />
                </div>
            </div>
        </div>
    );
};
