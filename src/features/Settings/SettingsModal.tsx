import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../../core/hooks/useSettings';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';
import type { GeneralSettings, SyncSettings, CloneSettings as CloneSettingsType, PackagingSettings, UploadDefaults, PickerSettings } from '../../core/services/settingsService';
import { cleanOrphanedCheckins } from './services/packagingCleanupService';
import type { AiAssistantSettings as AiSettingsType } from '../../core/types/chat/chat';
import { useChatStore } from '../../core/stores/chat/chatStore';
import { logger } from '../../core/utils/logger';
import { useUIStore } from '../../core/stores/uiStore';

import { Button } from '../../components/ui/atoms/Button/Button';

import { SettingsSidebar } from './components/SettingsSidebar';
import { ApiSyncSettings } from './components/ApiSyncSettings';
import { CloneSettings } from './components/CloneSettings';
import { PackagingSettingsView } from './components/PackagingSettingsView';
import { UploadDefaultsSettings } from './components/UploadDefaultsSettings';
import { TrendSyncSettings } from './components/TrendSyncSettings';
import { PickerSettingsView } from './components/PickerSettingsView';
import { AiAssistantSettings } from './components/AiAssistantSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Category = 'api_sync' | 'clone' | 'packaging' | 'upload_defaults' | 'trend_sync' | 'picker' | 'ai_assistant';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const {
        generalSettings, updateGeneralSettings,
        syncSettings, updateSyncSettings,
        cloneSettings, updateCloneSettings,
        packagingSettings, updatePackagingSettings,
        uploadDefaults, updateUploadDefaults,
        pickerSettings, updatePickerSettings
    } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { showToast } = useUIStore();
    useVideos(user?.uid || '', currentChannel?.id || '');

    const [activeCategory, setActiveCategory] = useState<Category>('api_sync');
    const [isClosing, setIsClosing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Local state for "Save" functionality
    const [localGeneral, setLocalGeneral] = useState<GeneralSettings>(generalSettings);
    const [localSync, setLocalSync] = useState<SyncSettings>(syncSettings);
    const [localClone, setLocalClone] = useState<CloneSettingsType>(cloneSettings);
    const [localPackaging, setLocalPackaging] = useState<PackagingSettings>(packagingSettings);
    const [localUploadDefaults, setLocalUploadDefaults] = useState<UploadDefaults>(uploadDefaults);
    const [localPicker, setLocalPicker] = useState<PickerSettings>(pickerSettings);

    const aiSettings = useChatStore(s => s.aiSettings);
    const saveAiSettings = useChatStore(s => s.saveAiSettings);
    const [localAiSettings, setLocalAiSettings] = useState<AiSettingsType>(aiSettings);

    // Force remount of children when modal opens to reset their internal state
    const [mountKey, setMountKey] = useState(0);

    // Reset local state when modal opens
    useEffect(() => {
        if (isOpen) {
            setLocalGeneral(generalSettings);
            setLocalSync(syncSettings);
            setLocalClone(cloneSettings);
            setLocalPackaging(packagingSettings);
            setLocalUploadDefaults(uploadDefaults);
            setLocalPicker(pickerSettings);
            setLocalAiSettings(aiSettings);
            setMountKey(prev => prev + 1);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Sync local AI settings when store updates (e.g. Firestore subscription arrives late)
    useEffect(() => {
        if (isOpen) setLocalAiSettings(aiSettings);
    }, [isOpen, aiSettings]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
        }, 200);
    };

    // Cleanup when closing the modal (unmounting)
    useEffect(() => {
        return () => {
            // We can't easily auto-run cleanup on unmount because we need 'validRuleIds' 
            // and we don't know if the user saved or cancelled.
            // But the user asked for "cleanup ... when closing".
            // If they saved, handleSave runs it.
            // If they cancel, they might have added duplicates temporarily? No, those aren't saved.
            // So implicit cleanup on unmount is only safe if we assume CURRENT settings are valid.
            // But if they cancelled changes, current settings might NOT be what they wanted?
            // ACTUALLY: The request "cleanup when closing" likely refers to ensuring no trash is left behind.
            // Since we persist on Save, HandleSave is the right place. 
            // The user's issue was likely that it didn't run effectively.
        };
    }, []);

    const handleManualCleanup = async () => {
        if (!user || !currentChannel) return;
        setIsSaving(true);
        try {
            // Use current LOCAL settings for validation
            const validRuleIds = new Set(localPackaging.checkinRules.map(r => r.id));
            await cleanOrphanedCheckins(user.uid, currentChannel.id, validRuleIds, false);
            showToast('Cleanup completed successfully', 'success');
        } catch (error: unknown) {
            logger.error('[Cleanup] Cleanup failed:', { error });
            showToast('Cleanup failed', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        if (!user || !currentChannel) return;

        setIsSaving(true);
        try {
            // Get the set of valid rule IDs that will exist after save
            const validRuleIds = new Set(localPackaging.checkinRules.map(r => r.id));

            // First update settings to ensure system state is consistent
            await Promise.all([
                updateGeneralSettings(user.uid, currentChannel.id, localGeneral),
                updateSyncSettings(user.uid, currentChannel.id, localSync),
                updateCloneSettings(user.uid, currentChannel.id, localClone),
                updatePackagingSettings(user.uid, currentChannel.id, localPackaging),
                updateUploadDefaults(user.uid, currentChannel.id, localUploadDefaults),
                updatePickerSettings(user.uid, currentChannel.id, localPicker),
                saveAiSettings(localAiSettings),
            ]);

            // Run cleanup AFTER saving settings to ensure no race conditions
            // (e.g. scheduler seeing old rules while we clean up)
            await cleanOrphanedCheckins(user.uid, currentChannel.id, validRuleIds, true);
            handleClose();
        } catch (error) {
            logger.error('[Settings] Failed to save settings:', { error });
            showToast('Failed to save settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Validation for Packaging Rules
    const hasPackagingDuplicates = (() => {
        const hoursSeen = new Set<number>();
        for (const rule of localPackaging.checkinRules) {
            if (hoursSeen.has(rule.hoursAfterPublish)) return true;
            hoursSeen.add(rule.hoursAfterPublish);
        }
        return false;
    })();

    const isDirty =
        JSON.stringify(localGeneral) !== JSON.stringify(generalSettings) ||
        JSON.stringify(localSync) !== JSON.stringify(syncSettings) ||
        JSON.stringify(localClone) !== JSON.stringify(cloneSettings) ||
        JSON.stringify(localPackaging) !== JSON.stringify(packagingSettings) ||
        JSON.stringify(localUploadDefaults) !== JSON.stringify(uploadDefaults) ||
        JSON.stringify(localPicker) !== JSON.stringify(pickerSettings) ||
        JSON.stringify(localAiSettings) !== JSON.stringify(aiSettings);

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
            className={`fixed inset-0 z-modal flex items-center justify-center p-4 backdrop-blur-sm ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ backgroundColor: 'var(--modal-overlay)' }}
            onClick={handleClose}
        >
            <div
                className={`relative w-[60vw] h-[70vh] ${bgMain} rounded-xl shadow-2xl flex flex-col overflow-hidden ${isClosing ? 'animate-scale-out' : 'animate-scale-in'} transition-colors duration-200`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-6 h-[63px] flex items-center border-b ${borderColor}`}>
                    <h2 className={`text-xl font-medium ${textPrimary}`}>Settings</h2>
                </div>

                {/* Body */}
                <div className="flex-1 flex min-h-0">
                    {/* Sidebar */}
                    <SettingsSidebar
                        activeCategory={activeCategory}
                        onCategoryChange={(c) => setActiveCategory(c as Category)}
                        theme={{ isDark, textSecondary, textPrimary, hoverBg, activeItemBg, activeItemText, borderColor, bgMain }}
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
                                onCleanup={handleManualCleanup}
                            />
                        )}
                        {activeCategory === 'upload_defaults' && (
                            <UploadDefaultsSettings
                                key={mountKey}
                                settings={localUploadDefaults}
                                onChange={setLocalUploadDefaults}
                            />
                        )}
                        {activeCategory === 'trend_sync' && (
                            <TrendSyncSettings
                                settings={localSync}
                                onChange={setLocalSync}
                                theme={{ isDark, borderColor, textSecondary, bgMain, textPrimary }}
                            />
                        )}
                        {activeCategory === 'picker' && (
                            <PickerSettingsView
                                key={mountKey}
                                settings={localPicker}
                                onChange={setLocalPicker}
                                theme={{ isDark, borderColor, textSecondary, bgMain, textPrimary }}
                            />
                        )}
                        {activeCategory === 'ai_assistant' && (
                            <AiAssistantSettings
                                key={mountKey}
                                settings={localAiSettings}
                                onChange={setLocalAiSettings}
                                theme={{ isDark, textSecondary, textPrimary, borderColor, bgMain }}
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className={`px-4 h-[67px] border-t ${borderColor} flex items-center justify-end gap-2 ${bgMain}`}>
                    <Button variant="secondary" onClick={handleClose}>
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!isDirty || isSaving || hasPackagingDuplicates}
                        isLoading={isSaving}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};

SettingsModal.displayName = 'SettingsModal';

