import React, { useState } from 'react';
import { ChevronDown, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Dropdown } from '../../components/ui/molecules/Dropdown';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideoSync } from '../../core/hooks/useVideoSync';

import type { GeneralSettings, SyncSettings } from '../../core/services/settingsService';

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

interface ApiSyncSettingsProps {
    generalSettings: GeneralSettings;
    syncSettings: SyncSettings;
    onGeneralChange: (s: GeneralSettings) => void;
    onSyncChange: (s: SyncSettings) => void;
    theme: ThemeProps;
}

export const ApiSyncSettings: React.FC<ApiSyncSettingsProps> = ({ generalSettings, syncSettings, onGeneralChange, onSyncChange, theme }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [showApiKey, setShowApiKey] = useState(true); // Default to visible
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { syncAllVideos, isSyncing } = useVideoSync(user?.uid || '', currentChannel?.id || '');

    const getUnit = (hours: number) => {
        if (hours % 168 === 0 && hours >= 168) return 'Weeks';
        if (hours % 24 === 0 && hours >= 24) return 'Days';
        if (hours >= 1 && Number.isInteger(hours)) return 'Hours';
        return 'Minutes';
    };

    const getValue = (hours: number, unit: string) => {
        if (unit === 'Weeks') return hours / 168;
        if (unit === 'Days') return hours / 24;
        if (unit === 'Minutes') return Math.round(hours * 60);
        return hours;
    };

    // State for the currently selected unit
    const [currentUnit, setCurrentUnit] = useState(() => getUnit(syncSettings.frequencyHours));

    const [prevFreq, setPrevFreq] = useState(syncSettings.frequencyHours);
    if (syncSettings.frequencyHours !== prevFreq) {
        setPrevFreq(syncSettings.frequencyHours);
        setCurrentUnit(getUnit(syncSettings.frequencyHours));
    }

    const updateFrequency = (val: number, unit: string) => {
        let newHours = val;
        if (unit === 'Weeks') newHours = val * 168;
        else if (unit === 'Days') newHours = val * 24;
        else if (unit === 'Minutes') newHours = val / 60;

        onSyncChange({ ...syncSettings, frequencyHours: Math.max(0.01, newHours) });
        setCurrentUnit(unit);
    };

    const currentValue = getValue(syncSettings.frequencyHours, currentUnit);

    // Updated input styles to use CSS variables
    const inputBg = 'bg-[var(--settings-input-bg)]';
    const inputBorder = 'border-border';
    const focusBorder = 'focus:border-text-primary';
    // Dropdown specific styles using CSS variables
    const dropdownBg = 'bg-[var(--settings-dropdown-bg)]';
    const dropdownHover = 'hover:bg-[var(--settings-dropdown-hover)]';

    return (
        <div className="space-y-8 animate-fade-in max-w-[600px]">
            {/* API Key Section */}
            <section className="space-y-4">
                <h3 className="text-base font-medium">API Configuration</h3>
                <div className="space-y-2">
                    <label className={`text-sm ${theme.textSecondary}`}>YouTube API Key</label>
                    <div className="relative">
                        <input
                            type={showApiKey ? "text" : "password"}
                            value={generalSettings.apiKey || ''}
                            onChange={(e) => onGeneralChange({ ...generalSettings, apiKey: e.target.value })}
                            placeholder="Enter your API key"
                            className={`w-full ${inputBg} border ${inputBorder} rounded-md pl-3 pr-10 py-2 focus:outline-none ${focusBorder} transition-colors placeholder-text-secondary`}
                        />
                        <button
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
                        >
                            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <p className={`text-xs ${theme.textSecondary}`}>
                        Required for fetching video details and channel information.
                    </p>
                </div>
            </section>

            <div className={`border-t ${theme.borderColor}`} />

            {/* Sync Section */}
            <section className="space-y-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-medium">Sync Configuration</h3>
                    </div>
                    <p className={`text-sm ${theme.textSecondary}`}>
                        Control automatic data updates and synchronization.
                    </p>
                </div>

                {/* Auto Sync Frequency */}
                <div className={`border ${theme.borderColor} rounded-md p-4`}>
                    <label className={`block text-xs ${theme.textSecondary} mb-2`}>Update Frequency</label>
                    <div className="flex items-center gap-4">
                        <div className="w-24 relative">
                            <input
                                type="text"
                                value={currentValue}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    updateFrequency(val, currentUnit);
                                }}
                                className={`w-full ${inputBg} border ${inputBorder} rounded-md px-3 py-2 focus:outline-none ${focusBorder} transition-colors no-spinner`}
                            />
                        </div>

                        <div className="relative w-32">
                            <button
                                onClick={(e) => setAnchorEl(e.currentTarget)}
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
                                {['Minutes', 'Hours', 'Days', 'Weeks'].map((unit) => (
                                    <div
                                        key={unit}
                                        className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors`}
                                        onClick={() => {
                                            updateFrequency(currentValue, unit);
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
            </section>

            <div className={`border-t ${theme.borderColor}`} />

            {/* Manual Sync Section */}
            <section className="space-y-4">
                <div className="space-y-1">
                    <h3 className="text-base font-medium">Manual Sync</h3>
                    <p className={`text-sm ${theme.textSecondary}`}>
                        Force an immediate update of all tracked metrics.
                    </p>
                </div>

                <button
                    onClick={() => {
                        if (user && currentChannel && generalSettings.apiKey) {
                            syncAllVideos(generalSettings.apiKey);
                        } else if (!generalSettings.apiKey) {
                            // Ideally show a toast here, but alert is a quick fallback if no toast hook available in this file context yet
                            // Actually we can just rely on the button incorrectly not disabling for now or just generic alert
                            alert("Please set API Key first");
                        }
                    }}
                    disabled={isSyncing || !generalSettings.apiKey}
                    className={`w-full py-2 rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-colors ${isSyncing || !generalSettings.apiKey ? `${theme.activeItemBg} ${theme.textSecondary} cursor-not-allowed` : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'}`}
                >
                    <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
            </section>
        </div>
    );
};
