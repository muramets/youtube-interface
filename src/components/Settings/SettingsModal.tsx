import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../../hooks/useSettings';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import type { GeneralSettings, SyncSettings, CloneSettings as CloneSettingsType, PackagingSettings } from '../../services/settingsService';

import { SettingsSidebar } from './SettingsSidebar';
import { ApiSyncSettings } from './ApiSyncSettings';
import { CloneSettings } from './CloneSettings';
import { PackagingSettingsView } from './PackagingSettingsView';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Category = 'api_sync' | 'clone' | 'packaging';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const {
        generalSettings, updateGeneralSettings,
        syncSettings, updateSyncSettings,
        cloneSettings, updateCloneSettings,
        packagingSettings, updatePackagingSettings
    } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [activeCategory, setActiveCategory] = useState<Category>('api_sync');
    const [isClosing, setIsClosing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Local state for "Save" functionality
    const [localGeneral, setLocalGeneral] = useState<GeneralSettings>(generalSettings);
    const [localSync, setLocalSync] = useState<SyncSettings>(syncSettings);
    const [localClone, setLocalClone] = useState<CloneSettingsType>(cloneSettings);
    const [localPackaging, setLocalPackaging] = useState<PackagingSettings>(packagingSettings);

    // Force remount of children when modal opens to reset their internal state
    const [mountKey, setMountKey] = useState(0);

    // Reset local state when modal opens
    useEffect(() => {
        if (isOpen) {
            setLocalGeneral(generalSettings);
            setLocalSync(syncSettings);
            setLocalClone(cloneSettings);
            setLocalPackaging(packagingSettings);
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
                updateCloneSettings(user.uid, currentChannel.id, localClone),
                updatePackagingSettings(user.uid, currentChannel.id, localPackaging)
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
        JSON.stringify(localClone) !== JSON.stringify(cloneSettings) ||
        JSON.stringify(localPackaging) !== JSON.stringify(packagingSettings);

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
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ backgroundColor: 'var(--modal-overlay)' }}
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
                    <SettingsSidebar
                        activeCategory={activeCategory}
                        onCategoryChange={(c) => setActiveCategory(c as Category)}
                        theme={{ isDark, textSecondary, hoverBg, activeItemBg, activeItemText, borderColor, bgMain }}
                    />

                    {/* Content */}
                    <div className={`flex-1 overflow-y-auto p-6 ${textPrimary}`}>
                        {activeCategory === 'api_sync' && (
                            <ApiSyncSettings
                                key={mountKey}
                                generalSettings={localGeneral}
                                syncSettings={localSync}
                                onGeneralChange={setLocalGeneral}
                                onSyncChange={setLocalSync}
                                theme={{ isDark, borderColor, textSecondary, bgMain, textPrimary }}
                            />
                        )}
                        {activeCategory === 'clone' && (
                            <CloneSettings
                                key={mountKey}
                                settings={localClone}
                                onChange={setLocalClone}
                                theme={{ isDark, borderColor, textSecondary, bgMain, textPrimary }}
                            />
                        )}
                        {activeCategory === 'packaging' && (
                            <PackagingSettingsView
                                key={mountKey}
                                settings={localPackaging}
                                onChange={setLocalPackaging}
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
                                ? 'bg-[var(--primary-button-bg)] text-[var(--primary-button-text)] hover:bg-[var(--primary-button-hover)] cursor-pointer'
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

