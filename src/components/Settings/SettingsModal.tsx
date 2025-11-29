import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useChannelStore } from '../../stores/channelStore';
import { Dropdown } from '../Shared/Dropdown';
import type { GeneralSettings, SyncSettings, CloneSettings } from '../../services/settingsService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Category = 'api_sync' | 'clone';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const {
        generalSettings, updateGeneralSettings,
        syncSettings, updateSyncSettings,
        cloneSettings, updateCloneSettings
    } = useSettingsStore();
    const { user } = useAuthStore();
    const { currentChannel } = useChannelStore();

    const [activeCategory, setActiveCategory] = useState<Category>('api_sync');
    const [isClosing, setIsClosing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Local state for "Save" functionality
    const [localGeneral, setLocalGeneral] = useState<GeneralSettings>(generalSettings);
    const [localSync, setLocalSync] = useState<SyncSettings>(syncSettings);
    const [localClone, setLocalClone] = useState<CloneSettings>(cloneSettings);

    // Force remount of children when modal opens to reset their internal state
    const [mountKey, setMountKey] = useState(0);

    // Reset local state when modal opens
    useEffect(() => {
        if (isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocalGeneral(generalSettings);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocalSync(syncSettings);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocalClone(cloneSettings);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMountKey(prev => prev + 1);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
        }, 200);
    };

    const handleSave = async () => {
        if (!user || !currentChannel) return;

        setIsSaving(true);
        try {
            await Promise.all([
                updateGeneralSettings(user.uid, currentChannel.id, localGeneral),
                updateSyncSettings(user.uid, currentChannel.id, localSync),
                updateCloneSettings(user.uid, currentChannel.id, localClone)
            ]);
            handleClose();
        } catch (error) {
            console.error("Failed to save settings:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const isDirty =
        JSON.stringify(localGeneral) !== JSON.stringify(generalSettings) ||
        JSON.stringify(localSync) !== JSON.stringify(syncSettings) ||
        JSON.stringify(localClone) !== JSON.stringify(cloneSettings);

    // Theme styles - Correctly detect dark mode including 'device' setting
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const checkTheme = () => {
            if (localGeneral.theme === 'device') {
                setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
            } else {
                setIsDark(localGeneral.theme === 'dark');
            }
        };
        checkTheme();
        // Listen for system changes if in device mode
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = () => {
            if (localGeneral.theme === 'device') checkTheme();
        };
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
    }, [localGeneral.theme]);

    const bgMain = 'bg-bg-secondary'; // Use theme variables
    const bgSidebar = 'bg-bg-secondary'; // Unified background
    const textPrimary = 'text-text-primary';
    const textSecondary = 'text-text-secondary';
    const borderColor = 'border-border';

    // Sidebar styles using new CSS variables
    const hoverBg = 'hover:bg-[var(--settings-menu-hover)]';
    const activeItemBg = 'bg-[var(--settings-menu-active)]';
    const activeItemText = 'text-text-primary';

    if (!isOpen && !isClosing) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            onClick={handleClose}
        >
            <div
                className={`relative w-full max-w-[960px] h-[618px] ${bgMain} rounded-xl shadow-2xl flex flex-col overflow-hidden ${isClosing ? 'animate-scale-out' : 'animate-scale-in'} transition-colors duration-200`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-6 h-[63px] flex items-center border-b ${borderColor}`}>
                    <h2 className={`text-xl font-medium ${textPrimary}`}>Settings</h2>
                </div>

                {/* Body */}
                <div className="flex-1 flex min-h-0 h-[488px]">
                    {/* Sidebar */}
                    <div className={`w-[279px] border-r ${borderColor} py-2 flex flex-col pt-2 ${bgSidebar}`}>
                        <SidebarItem
                            label="API & Sync"
                            isActive={activeCategory === 'api_sync'}
                            onClick={() => setActiveCategory('api_sync')}
                            theme={{ isDark, textSecondary, hoverBg, activeItemBg, activeItemText }}
                        />
                        <SidebarItem
                            label="Clone"
                            isActive={activeCategory === 'clone'}
                            onClick={() => setActiveCategory('clone')}
                            theme={{ isDark, textSecondary, hoverBg, activeItemBg, activeItemText }}
                        />
                    </div>

                    {/* Content */}
                    <div className={`flex-1 overflow-y-auto p-6 ${textPrimary}`}>
                        {activeCategory === 'api_sync' && (
                            <ApiAndSyncSettingsView
                                key={mountKey}
                                generalSettings={localGeneral}
                                syncSettings={localSync}
                                onGeneralChange={setLocalGeneral}
                                onSyncChange={setLocalSync}
                                theme={{ isDark, borderColor, textSecondary, bgMain, textPrimary }}
                            />
                        )}
                        {activeCategory === 'clone' && (
                            <CloneSettingsView
                                key={mountKey}
                                settings={localClone}
                                onChange={setLocalClone}
                                theme={{ isDark, borderColor, textSecondary, bgMain, textPrimary }}
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className={`px-4 h-[67px] border-t ${borderColor} flex items-center justify-end gap-2 ${bgMain}`}>
                    <button
                        onClick={handleClose}
                        className={`px-4 py-2 rounded-2xl text-sm font-medium ${textPrimary} ${hoverBg} transition-colors cursor-pointer`}
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        className={`px-6 py-2 rounded-2xl text-sm font-medium transition-all relative overflow-hidden
                            ${isDirty
                                ? 'bg-text-primary text-bg-primary hover:opacity-90 cursor-pointer'
                                : 'bg-bg-primary text-text-secondary cursor-default opacity-50'
                            }
                            ${isSaving ? 'cursor-wait' : ''}`}
                    >
                        {isSaving && isDirty && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent animate-shimmer bg-[length:200%_100%]"></div>
                        )}
                        <span className="relative z-10">Save</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

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

const SidebarItem: React.FC<{
    label: string;
    isActive: boolean;
    onClick: () => void;
    theme: ThemeProps;
}> = ({ label, isActive, onClick, theme }) => (
    <div className="px-2">
        <button
            onClick={onClick}
            className={`w-full text-left px-4 h-[48px] flex items-center text-[15px] transition-colors rounded-lg
                ${isActive
                    ? `${theme.activeItemBg} ${theme.activeItemText} font-medium`
                    : `${theme.textSecondary} ${theme.hoverBg}`
                }`}
        >
            {label}
        </button>
    </div>
);

const ApiAndSyncSettingsView: React.FC<{
    generalSettings: GeneralSettings;
    syncSettings: SyncSettings;
    onGeneralChange: (s: GeneralSettings) => void;
    onSyncChange: (s: SyncSettings) => void;
    theme: ThemeProps;
}> = ({ generalSettings, syncSettings, onGeneralChange, onSyncChange, theme }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [showApiKey, setShowApiKey] = useState(true); // Default to visible

    const getUnit = (hours: number) => {
        if (hours < 1) return 'Minutes';
        if (hours >= 24) return 'Days';
        return 'Hours';
    };

    const getValue = (hours: number, unit: string) => {
        if (unit === 'Minutes') return Math.round(hours * 60);
        if (unit === 'Days') return Math.round(hours / 24);
        return hours;
    };

    // State for the currently selected unit
    const [currentUnit, setCurrentUnit] = useState(() => getUnit(syncSettings.frequencyHours));

    // Update unit when settings change externally (e.g. reset)
    useEffect(() => {
        // Only update if the calculated unit for the current value is different from the current state
        // AND the current state doesn't make sense for the value (optional, but safer to just respect props on mount/reset)
        // Actually, since we unmount on close, initial state is enough. 
        // But let's keep it synced if the user cancels and re-opens without unmounting (if logic changes).
        // For now, just relying on initial state is fine since it unmounts.
    }, []);

    const updateFrequency = (val: number, unit: string) => {
        let newHours = val;
        if (unit === 'Minutes') newHours = val / 60;
        else if (unit === 'Days') newHours = val * 24;

        onSyncChange({ ...syncSettings, frequencyHours: newHours });
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
                                type="number"
                                value={currentValue}
                                onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 0);
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
                                {['Minutes', 'Hours', 'Days'].map((unit) => (
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
        </div>
    );
};

const CloneSettingsView: React.FC<{
    settings: CloneSettings;
    onChange: (s: CloneSettings) => void;
    theme: ThemeProps;
}> = ({ settings, onChange, theme }) => {
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
