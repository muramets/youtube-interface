import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dropdown } from '../../../components/ui/molecules/Dropdown';
import type { CloneSettings as CloneSettingsType } from '../../../core/services/settingsService';
import { getDurationUnit, getDurationValue, durationToSeconds, type DurationUnit } from '../utils/unitConversion';
import { type SettingsTheme, SETTINGS_STYLES } from '../types';

interface CloneSettingsProps {
    settings: CloneSettingsType;
    onChange: (s: CloneSettingsType) => void;
    theme: SettingsTheme;
}

export const CloneSettings: React.FC<CloneSettingsProps> = ({ settings, onChange, theme }) => {
    const [isUnitOpen, setIsUnitOpen] = useState(false);
    const [unitBtnEl, setUnitBtnEl] = useState<HTMLButtonElement | null>(null);

    const updateDuration = (val: number, unit: DurationUnit) => {
        const newSeconds = durationToSeconds(val, unit);
        onChange({ ...settings, cloneDurationSeconds: Math.max(10, newSeconds) });
    };

    const currentUnit = getDurationUnit(settings.cloneDurationSeconds);
    const currentValue = getDurationValue(settings.cloneDurationSeconds, currentUnit);

    const { inputBg, inputBorder, hoverBorder, focusBorder, dropdownBg, dropdownHover } = SETTINGS_STYLES;

    return (
        <div className="space-y-8 animate-fade-in max-w-[800px]">
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
                            className={`w-full ${inputBg} border ${inputBorder} rounded-md px-3 py-2 focus:outline-none ${hoverBorder} ${focusBorder} transition-colors no-spinner`}
                        />
                    </div>

                    <div className="relative w-32">
                        <button
                            ref={setUnitBtnEl}
                            onClick={() => setIsUnitOpen(prev => !prev)}
                            className={`w-full flex items-center justify-between ${inputBg} border ${inputBorder} ${isUnitOpen ? 'rounded-t-md rounded-b-none border-b-transparent' : 'rounded-md'} px-3 py-2 hover:border-text-secondary transition-colors`}
                        >
                            <span className="text-sm">{currentUnit}</span>
                            <ChevronDown size={16} className={`${theme.textSecondary} transition-transform ${isUnitOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <Dropdown
                            isOpen={isUnitOpen}
                            anchorEl={unitBtnEl}
                            onClose={() => setIsUnitOpen(false)}
                            width={128}
                            className={`${dropdownBg}`}
                            zIndexClass="z-tooltip"
                            connected
                        >
                            {['Seconds', 'Minutes', 'Hours'].map((unit) => (
                                <div
                                    key={unit}
                                    className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors`}
                                    onClick={() => {
                                        updateDuration(currentValue, unit as DurationUnit);
                                        setIsUnitOpen(false);
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
