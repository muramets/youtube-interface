import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../../hooks/useSettings';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { useVideos } from '../../hooks/useVideos';
import { VideoService } from '../../services/videoService';
import { NotificationService } from '../../services/notificationService';
import type { GeneralSettings, SyncSettings, CloneSettings as CloneSettingsType, PackagingSettings, UploadDefaults } from '../../services/settingsService';

import { SettingsSidebar } from './SettingsSidebar';
import { ApiSyncSettings } from './ApiSyncSettings';
import { CloneSettings } from './CloneSettings';
import { PackagingSettingsView } from './PackagingSettingsView';
import { UploadDefaultsSettings } from './UploadDefaultsSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Category = 'api_sync' | 'clone' | 'packaging' | 'upload_defaults';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const {
        generalSettings, updateGeneralSettings,
        syncSettings, updateSyncSettings,
        cloneSettings, updateCloneSettings,
        packagingSettings, updatePackagingSettings,
        uploadDefaults, updateUploadDefaults
    } = useSettings();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
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

    // Extracted cleanup logic re-used by Save and Manual Cleanup
    const cleanOrphanedCheckins = async (validRuleIds: Set<string>, silent = false) => {
        if (!user || !currentChannel) return;

        // Force fetch fresh data. 
        // We MUST do this because local 'videos' might be stale (e.g. if a check-in was just created by scheduler in background).
        // Without this, we might write back a 'clean' history that unknowingly overwrites/ignores the new check-in, or fails to see it to remove it.
        if (!silent && !user?.uid) return;

        const freshVideos = await VideoService.fetchVideos(user.uid, currentChannel.id);

        // Helper to check if a check-in is empty
        const isCheckinEmpty = (checkin: any) => {
            const m = checkin.metrics;
            if (!m) return true;
            return (m.impressions === null || m.impressions === undefined) &&
                (m.ctr === null || m.ctr === undefined) &&
                (m.views === null || m.views === undefined) &&
                (m.avdSeconds === null || m.avdSeconds === undefined);
        };

        const notificationIdsToDelete: string[] = [];
        const cleanupPromises: Promise<any>[] = [];

        for (const video of freshVideos) {
            if (!video.packagingHistory || video.packagingHistory.length === 0) continue;

            let hasChanges = false;
            const newHistory = video.packagingHistory.map((version: any) => {
                const cleanedCheckins = version.checkins.filter((checkin: any) => {
                    // Manual check-ins (no ruleId) are always kept
                    if (!checkin.ruleId) return true;

                    // If rule exists, keep it
                    if (validRuleIds.has(checkin.ruleId)) return true;

                    // Rule is MISSING. Check if it's empty.
                    const empty = isCheckinEmpty(checkin);

                    // If it has data, kept it (safety)
                    if (!empty) return true;

                    // It is Orphaned AND Empty -> REMOVE
                    if (checkin.ruleId) {
                        notificationIdsToDelete.push(`checkin-due-${video.id}-${checkin.ruleId}`);
                    }
                    hasChanges = true;
                    return false;
                });
                return { ...version, checkins: cleanedCheckins };
            });

            if (hasChanges) {
                if (!silent) console.log('[Cleanup] Removing orphaned check-ins from video:', video.id);
                // Use VideoService directly to update
                cleanupPromises.push(
                    VideoService.updateVideo(user.uid, currentChannel.id, video.id, { packagingHistory: newHistory })
                        .then(() => {
                            // Check updated
                        })
                );
            }
        }

        await Promise.all(cleanupPromises);

        if (notificationIdsToDelete.length > 0) {
            try {
                await NotificationService.removeNotifications(user.uid, currentChannel.id, notificationIdsToDelete);
                if (!silent) console.log('[Cleanup] Removed notifications:', notificationIdsToDelete);
            } catch (error) {
                console.error('[Cleanup] Failed to remove notifications:', error);
            }
        }
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
            await cleanOrphanedCheckins(validRuleIds, false);
            alert('Cleanup process completed. Check console for details.');
        } catch (error) {
            console.error("Cleanup failed:", error);
            alert('Cleanup failed. See console.');
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
                updateUploadDefaults(user.uid, currentChannel.id, localUploadDefaults)
            ]);

            // Run cleanup AFTER saving settings to ensure no race conditions
            // (e.g. scheduler seeing old rules while we clean up)
            await cleanOrphanedCheckins(validRuleIds, true); // Silent mode for auto-save
            handleClose();
        } catch (error) {
            console.error("Failed to save settings:", error);
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
        JSON.stringify(localClone) !== JSON.stringify(cloneSettings) ||
        JSON.stringify(localPackaging) !== JSON.stringify(packagingSettings) ||
        JSON.stringify(localUploadDefaults) !== JSON.stringify(uploadDefaults);

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
                        disabled={!isDirty || isSaving || hasPackagingDuplicates}
                        className={`px-6 py-2 rounded-2xl text-sm font-medium transition-all relative overflow-hidden
                            ${(isDirty && !hasPackagingDuplicates)
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

