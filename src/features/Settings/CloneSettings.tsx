import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dropdown } from '../../components/Shared/Dropdown';
import type { CloneSettings as CloneSettingsType } from '../../core/services/settingsService';

interface ThemeProps {
    isDark: boolean;
    textSecondary: string;
    hoverBg?: string;
    activeItemBg?: string;
    activeItemText?: string;
    borderColor?: string;
    bgMain?: string;
    textPrimary?: string;
}

interface CloneSettingsProps {
    settings: CloneSettingsType;
    onChange: (s: CloneSettingsType) => void;
    theme: ThemeProps;
}

export const CloneSettings: React.FC<CloneSettingsProps> = ({ settings, onChange, theme }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const getUnit = (seconds: number) => {
        if (seconds % 3600 === 0) return 'Hours';
        if (seconds % 60 === 0) return 'Minutes';
        return 'Seconds';
    };

    const getValue = (seconds: number, unit: string) => {
        if (unit === 'Hours') return seconds / 3600;
        if (unit === 'Minutes') return seconds / 60;
        return seconds;
    };

    const updateDuration = (val: number, unit: string) => {
        let newSeconds = val;
        if (unit === 'Hours') newSeconds = val * 3600;
        else if (unit === 'Minutes') newSeconds = val * 60;
        onChange({ ...settings, cloneDurationSeconds: Math.max(10, newSeconds) });
    };

    const currentUnit = getUnit(settings.cloneDurationSeconds);
    const currentValue = getValue(settings.cloneDurationSeconds, currentUnit);

    // Updated input styles to use CSS variables
    const inputBg = 'bg-[var(--settings-input-bg)]';
    const inputBorder = 'border-border';
    const focusBorder = 'focus:border-text-primary';
    // Dropdown specific styles using CSS variables
    const dropdownBg = 'bg-[var(--settings-dropdown-bg)]';
    const dropdownHover = 'hover:bg-[var(--settings-dropdown-hover)]';

    return (
        <div className="space-y-8 animate-fade-in max-w-[600px]">
            <section className="space-y-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium">Clone Duration</h3>
                </div>
                <p className={`text-sm ${theme.textSecondary}`}>
                    How long cloned video cards remain visible before auto-deletion.
                </p>
            </section>

            <div className={`border ${theme.borderColor} rounded-md p-4`}>
                <label className={`block text-xs ${theme.textSecondary} mb-2`}>Duration</label>
                <div className="flex items-center gap-4">
                    <div className="w-24 relative">
                        <input
                            type="number"
                            value={currentValue}
                            onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 0);
                                updateDuration(val, currentUnit);
                            }}
                            className={`w-full ${inputBg} border ${inputBorder} rounded-md px-3 py-2 focus:outline-none ${focusBorder} transition-colors no-spinner`}
                        />
                    </div>

                    <div className="relative w-32">
                        <button
                            onClick={(e) => setAnchorEl(prev => prev ? null : e.currentTarget)}
                            className={`w-full flex items-center justify-between ${inputBg} border ${inputBorder} rounded-md px-3 py-2 hover:border-gray-400 transition-colors`}
                        >
                            <span className="text-sm">{currentUnit}</span>
                            <ChevronDown size={16} className={`${theme.textSecondary} transition-transform ${anchorEl ? 'rotate-180' : ''}`} />
                        </button>

                        <Dropdown
                            isOpen={Boolean(anchorEl)}
                            anchorEl={anchorEl}
                            onClose={() => setAnchorEl(null)}
                            width={128}
                            className={`${dropdownBg} border-none z-[10000]`}
                        >
                            {['Seconds', 'Minutes', 'Hours'].map((unit) => (
                                <div
                                    key={unit}
                                    className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors`}
                                    onClick={() => {
                                        updateDuration(currentValue, unit);
                                        setAnchorEl(null);
                                    }}
                                >
                                    {unit}
                                </div>
                            ))}
                        </Dropdown>
                    </div>
                </div>
            </div>
        </div>
    );
};
