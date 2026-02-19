import React, { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '../../core/hooks/useSettings';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

interface SettingsMenuCloneProps {
    onBack: () => void;
}

export const SettingsMenuClone: React.FC<SettingsMenuCloneProps> = ({ onBack }) => {
    const { cloneSettings, updateCloneSettings } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);

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
        if (!user || !currentChannel) return;
        let newSeconds = val;
        if (unit === 'Hours') newSeconds = val * 3600;
        else if (unit === 'Minutes') newSeconds = val * 60;
        updateCloneSettings(user.uid, currentChannel.id, { cloneDurationSeconds: Math.max(10, newSeconds) });
    };

    const currentUnit = getUnit(cloneSettings.cloneDurationSeconds);
    const currentValue = getValue(cloneSettings.cloneDurationSeconds, currentUnit);

    return (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer"
                onClick={onBack}
            >
                <ArrowLeft size={20} />
                <span className="text-sm">Clone Settings</span>
            </div>

            <div className="p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <span className="text-xs text-text-secondary">Clone Duration</span>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-bg-primary border border-border rounded-lg p-1 w-24">
                            <input
                                type="text"
                                value={currentValue}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    updateDuration(val, currentUnit);
                                }}
                                className="bg-transparent border-none text-text-primary w-full text-center focus:outline-none font-medium"
                            />
                            <div className="flex flex-col border-l border-border pl-1 gap-0.5">
                                <button
                                    className="text-text-secondary hover:text-text-primary flex items-center justify-center h-3 w-4 cursor-pointer bg-transparent border-none p-0"
                                    onClick={() => updateDuration(currentValue + 1, currentUnit)}
                                >
                                    <ChevronRight size={12} className="-rotate-90" />
                                </button>
                                <button
                                    className="text-text-secondary hover:text-text-primary flex items-center justify-center h-3 w-4 cursor-pointer bg-transparent border-none p-0"
                                    onClick={() => {
                                        if (currentValue <= 1) return;
                                        updateDuration(currentValue - 1, currentUnit);
                                    }}
                                >
                                    <ChevronRight size={12} className="rotate-90" />
                                </button>
                            </div>
                        </div>

                        <div className="relative">
                            <button
                                className="bg-bg-primary text-text-primary border border-border rounded-lg p-2 text-sm flex items-center justify-between gap-2 min-w-[100px] cursor-pointer hover:bg-hover-bg"
                                onClick={() => setIsUnitDropdownOpen(!isUnitDropdownOpen)}
                            >
                                <span className="capitalize">{currentUnit}</span>
                                <ChevronRight size={14} className={`transition-transform ${isUnitDropdownOpen ? '-rotate-90' : 'rotate-90'}`} />
                            </button>

                            {isUnitDropdownOpen && (
                                <div className="fixed inset-0 z-dropdown" onClick={() => setIsUnitDropdownOpen(false)}>
                                    <div
                                        className="absolute bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden animate-scale-in"
                                        style={{
                                            top: (document.activeElement as HTMLElement)?.getBoundingClientRect().bottom + 8,
                                            left: (document.activeElement as HTMLElement)?.getBoundingClientRect().left,
                                            minWidth: '100px'
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {['Seconds', 'Minutes', 'Hours'].map((unit) => (
                                            <div
                                                key={unit}
                                                className="px-3 py-2 text-sm cursor-pointer hover:bg-hover-bg text-text-primary"
                                                onClick={() => {
                                                    updateDuration(getValue(cloneSettings.cloneDurationSeconds, unit), unit);
                                                    setIsUnitDropdownOpen(false);
                                                }}
                                            >
                                                {unit}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">
                        How long cloned cards stay visible before auto-deletion.
                    </p>
                </div>
            </div>
        </>
    );
};
