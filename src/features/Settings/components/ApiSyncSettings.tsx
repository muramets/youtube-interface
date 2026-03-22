import React, { useState } from 'react';
import { ChevronDown, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/atoms/Button/Button';
import { Dropdown } from '../../../components/ui/molecules/Dropdown';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useVideoSync } from '../../../core/hooks/useVideoSync';

import type { GeneralSettings, SyncSettings } from '../../../core/services/settingsService';
import { getFrequencyUnit, getFrequencyValue, frequencyToHours, type FrequencyUnit } from '../utils/unitConversion';
import { type SettingsTheme, SETTINGS_STYLES } from '../types';

interface ApiSyncSettingsProps {
    generalSettings: GeneralSettings;
    syncSettings: SyncSettings;
    onGeneralChange: (s: GeneralSettings) => void;
    onSyncChange: (s: SyncSettings) => void;
    theme: SettingsTheme;
}

export const ApiSyncSettings: React.FC<ApiSyncSettingsProps> = ({ generalSettings, syncSettings, onGeneralChange, onSyncChange, theme }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [showApiKey, setShowApiKey] = useState(true); // Default to visible
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { syncAllVideos, isSyncing } = useVideoSync(user?.uid || '', currentChannel?.id || '');


    // State for the currently selected unit
    const [currentUnit, setCurrentUnit] = useState<FrequencyUnit>(() => getFrequencyUnit(syncSettings.frequencyHours));

    const [prevFreq, setPrevFreq] = useState(syncSettings.frequencyHours);
    if (syncSettings.frequencyHours !== prevFreq) {
        setPrevFreq(syncSettings.frequencyHours);
        setCurrentUnit(getFrequencyUnit(syncSettings.frequencyHours));
    }

    const updateFrequency = (val: number, unit: FrequencyUnit) => {
        const newHours = frequencyToHours(val, unit);
        onSyncChange({ ...syncSettings, frequencyHours: Math.max(0.01, newHours) });
        setCurrentUnit(unit);
    };

    const currentValue = getFrequencyValue(syncSettings.frequencyHours, currentUnit);

    const { inputBg, inputBorder, hoverBorder, focusBorder, dropdownBg, dropdownHover } = SETTINGS_STYLES;

    return (
        <div className="space-y-8 animate-fade-in max-w-[800px]">
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
                            className={`w-full ${inputBg} border ${inputBorder} rounded-md pl-3 pr-10 py-2 focus:outline-none ${hoverBorder} ${focusBorder} transition-colors placeholder-text-secondary`}
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
                                className={`w-full ${inputBg} border ${inputBorder} rounded-md px-3 py-2 focus:outline-none ${hoverBorder} ${focusBorder} transition-colors no-spinner`}
                            />
                        </div>

                        <div className="relative w-32">
                            <button
                                onClick={(e) => setAnchorEl(e.currentTarget)}
                                className={`w-full flex items-center justify-between ${inputBg} border ${inputBorder} ${anchorEl ? 'rounded-t-md rounded-b-none border-b-transparent' : 'rounded-md'} px-3 py-2 hover:border-text-secondary transition-colors`}
                            >
                                <span className="text-sm">{currentUnit}</span>
                                <ChevronDown size={16} className={`${theme.textSecondary} transition-transform ${anchorEl ? 'rotate-180' : ''}`} />
                            </button>

                            <Dropdown
                                isOpen={Boolean(anchorEl)}
                                anchorEl={anchorEl}
                                onClose={() => setAnchorEl(null)}
                                width={128}
                                className={`${dropdownBg}`}
                                zIndexClass="z-tooltip"
                                connected
                            >
                                {['Minutes', 'Hours', 'Days', 'Weeks'].map((unit) => (
                                    <div
                                        key={unit}
                                        className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors`}
                                        onClick={() => {
                                            updateFrequency(currentValue, unit as FrequencyUnit);
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

                <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                        if (user && currentChannel && generalSettings.apiKey) {
                            syncAllVideos(generalSettings.apiKey);
                        }
                    }}
                    disabled={isSyncing || !generalSettings.apiKey}
                    className="w-full"
                    leftIcon={<RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />}
                >
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
            </section>
        </div>
    );
};
