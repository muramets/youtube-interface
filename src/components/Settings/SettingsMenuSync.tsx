import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useVideoActions } from '../../context/VideoActionsContext';

interface SettingsMenuSyncProps {
    onBack: () => void;
}

export const SettingsMenuSync: React.FC<SettingsMenuSyncProps> = ({ onBack }) => {
    const { syncSettings, updateSyncSettings } = useSettings();
    const { manualSync, isSyncing } = useVideoActions();
    const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);

    const getUnit = (hours: number) => {
        if (hours % 168 === 0) return 'Weeks';
        if (hours % 24 === 0) return 'Days';
        return 'Hours';
    };

    const getValue = (hours: number, unit: string) => {
        if (unit === 'Weeks') return hours / 168;
        if (unit === 'Days') return hours / 24;
        return hours;
    };

    const updateFrequency = (val: number, unit: string) => {
        let newHours = val;
        if (unit === 'Weeks') newHours = val * 168;
        else if (unit === 'Days') newHours = val * 24;
        updateSyncSettings({ ...syncSettings, frequencyHours: Math.max(1, newHours) });
    };

    const currentUnit = getUnit(syncSettings.frequencyHours);
    const currentValue = getValue(syncSettings.frequencyHours, currentUnit);

    return (
        <>
            <div
                className="flex items-center gap-3 px-4 py-2 border-b border-border mb-2 cursor-pointer"
                onClick={onBack}
            >
                <ArrowLeft size={20} />
                <span className="text-sm">Sync Settings</span>
            </div>

            <div className="p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Auto-Sync</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={syncSettings.autoSync}
                            onChange={(e) => updateSyncSettings({ ...syncSettings, autoSync: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                </div>

                {syncSettings.autoSync && (
                    <div className="flex flex-col gap-2">
                        <span className="text-xs text-text-secondary">Sync Frequency</span>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-bg-primary border border-border rounded-lg p-1 w-24">
                                <input
                                    type="text"
                                    value={currentValue}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        updateFrequency(val, currentUnit);
                                    }}
                                    className="bg-transparent border-none text-text-primary w-full text-center focus:outline-none font-medium"
                                />
                                <div className="flex flex-col border-l border-border pl-1 gap-0.5">
                                    <button
                                        className="text-text-secondary hover:text-text-primary flex items-center justify-center h-3 w-4 cursor-pointer bg-transparent border-none p-0"
                                        onClick={() => updateFrequency(currentValue + 1, currentUnit)}
                                    >
                                        <ChevronRight size={12} className="-rotate-90" />
                                    </button>
                                    <button
                                        className="text-text-secondary hover:text-text-primary flex items-center justify-center h-3 w-4 cursor-pointer bg-transparent border-none p-0"
                                        onClick={() => {
                                            if (currentValue <= 1) return;
                                            updateFrequency(currentValue - 1, currentUnit);
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
                                    <div className="absolute top-full right-0 mt-1 w-full bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden z-10 animate-scale-in">
                                        {['Hours', 'Days', 'Weeks'].map((unit) => (
                                            <div
                                                key={unit}
                                                className="px-3 py-2 text-sm cursor-pointer hover:bg-hover-bg text-text-primary"
                                                onClick={() => {
                                                    updateFrequency(getValue(syncSettings.frequencyHours, unit), unit);
                                                    setIsUnitDropdownOpen(false);
                                                }}
                                            >
                                                {unit}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="border-t border-border pt-4">
                    <button
                        onClick={manualSync}
                        disabled={isSyncing}
                        className={`w-full py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors ${isSyncing ? 'bg-bg-secondary text-text-secondary cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'}`}
                    >
                        <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <p className="text-xs text-text-secondary mt-2 text-center">
                        Updates video stats (views, likes) from YouTube.
                    </p>
                </div>
            </div>
        </>
    );
};
