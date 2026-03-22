import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/atoms/Button/Button';
import { Toggle } from '../../../components/ui/atoms/Toggle/Toggle';
import { useSettings } from '../../../core/hooks/useSettings';
import { useVideoSync } from '../../../core/hooks/useVideoSync';

import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { getFrequencyUnit, getFrequencyValue, frequencyToHours, type FrequencyUnit } from '../utils/unitConversion';

interface SettingsMenuSyncProps {
    onBack: () => void;
}

export const SettingsMenuSync: React.FC<SettingsMenuSyncProps> = ({ onBack }) => {
    const { syncSettings, updateSyncSettings } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { syncAllVideos, isSyncing } = useVideoSync(user?.uid || '', currentChannel?.id || '');
    const { generalSettings } = useSettings();
    const { showToast } = useUIStore();
    const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);

    const updateFrequency = (val: number, unit: FrequencyUnit) => {
        if (!user || !currentChannel) return;
        const newHours = frequencyToHours(val, unit);
        updateSyncSettings(user.uid, currentChannel.id, { ...syncSettings, frequencyHours: Math.max(0.01, newHours) });
    };

    const currentUnit = getFrequencyUnit(syncSettings.frequencyHours);
    const currentValue = getFrequencyValue(syncSettings.frequencyHours, currentUnit);
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
                    <Toggle
                        checked={syncSettings.autoSync}
                        onChange={(checked) => {
                            if (user && currentChannel) {
                                updateSyncSettings(user.uid, currentChannel.id, { ...syncSettings, autoSync: checked });
                            }
                        }}
                        size="md"
                    />
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
                                        const val = parseFloat(e.target.value) || 0;
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
                                        {['Minutes', 'Hours', 'Days', 'Weeks'].map((unit) => (
                                            <div
                                                key={unit}
                                                className="px-3 py-2 text-sm cursor-pointer hover:bg-hover-bg text-text-primary"
                                                onClick={() => {
                                                    updateFrequency(getFrequencyValue(syncSettings.frequencyHours, unit as FrequencyUnit), unit as FrequencyUnit);
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
                    <Button
                        variant="primary"
                        size="md"
                        onClick={() => {
                            if (user && currentChannel && generalSettings.apiKey) {
                                syncAllVideos(generalSettings.apiKey);
                            } else if (!generalSettings.apiKey) {
                                showToast('Please set API Key first', 'error');
                            }
                        }}
                        disabled={isSyncing}
                        className="w-full"
                        leftIcon={<RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />}
                    >
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </Button>
                    <p className="text-xs text-text-secondary mt-2 text-center">
                        Updates video stats (views, likes) from YouTube.
                    </p>
                </div>

            </div>
        </>
    );
};
