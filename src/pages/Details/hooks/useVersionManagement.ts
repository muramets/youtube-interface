import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import type { SnapshotRequestParams } from '../types/versionManagement';
import { VersionService } from '../services/VersionService';
import { TrafficDataService } from '../../../core/services/traffic/TrafficDataService';
import { VideoService } from '../../../core/services/videoService';
import type { TrafficData } from '../../../core/types/traffic';
import type { PackagingVersion } from '../../../core/types/versioning';
import { db } from '../../../config/firebase';
import { writeBatch } from 'firebase/firestore';

interface VersionsHookState {
    packagingHistory: PackagingVersion[];
    activeVersion: number | 'draft';
    viewingVersion: number | 'draft';
    viewingPeriodIndex?: number;
    switchToVersion: (version: number | 'draft', periodIndex?: number) => void;
    deleteVersion: (version: number) => void;
    setActiveVersion: (version: number | 'draft') => void;
    restoreVersion: (version: number, closingSnapshotId?: string | null) => void;
    setHasDraft: (has: boolean) => void;
}

interface TrafficHookState {
    trafficData: TrafficData | null;
    updateLocalData?: (data: TrafficData) => void;
}

interface UseVersionManagementProps {
    versions: VersionsHookState;
    isFormDirty: boolean;
    video: VideoDetails;
    user: { uid: string } | null;
    currentChannel: { id: string } | null;
    updateVideo: (params: { videoId: string; updates: Partial<VideoDetails> }) => Promise<void>;
    showToast: (message: string, type: 'success' | 'error') => void;
    setSelectedSnapshot: (id: string | null) => void;
    activeTab: 'packaging' | 'traffic' | 'gallery' | 'editing';
    selectedSnapshot: string | null;
    trafficState: TrafficHookState;
    onOpenSwitchConfirm: (targetVersion: number | 'draft') => void;
    onOpenDeleteConfirm: (versionNumber: number, snapshotCount: number, totalViews: number, versionLabel?: string, isStacked?: boolean) => void;
    onOpenSnapshotRequest: (params: SnapshotRequestParams) => void;
}

/**
 * Хук для управления версиями (переключение, удаление, восстановление).
 * Извлекает бизнес-логику из DetailsLayout.
 */
export const useVersionManagement = ({
    versions,
    isFormDirty,
    video,
    user,
    currentChannel,
    updateVideo,
    showToast,
    setSelectedSnapshot,
    activeTab,
    selectedSnapshot,
    trafficState,
    onOpenSwitchConfirm,
    onOpenDeleteConfirm,
    onOpenSnapshotRequest
}: UseVersionManagementProps) => {
    // Initialize query client for cache invalidation
    const queryClient = useQueryClient();


    /**
     * Обработчик клика на версию в sidebar
     */
    const handleVersionClick = useCallback((versionNumber: number | 'draft', periodIndex?: number) => {
        // Разрешаем кликать на текущую версию для очистки selected snapshot
        if (versionNumber === versions.viewingVersion && periodIndex === versions.viewingPeriodIndex) {
            if (activeTab === 'traffic' && selectedSnapshot) {
                setSelectedSnapshot(null);
            }
            return;
        }

        if (isFormDirty) {
            // Если есть несохраненные изменения → показываем confirmation
            onOpenSwitchConfirm(versionNumber);
        } else {
            // Auto-select the latest snapshot for the target version/period
            const snapshots = trafficState.trafficData?.snapshots || [];
            const versionSnapshots = snapshots.filter(s => s.version === versionNumber);

            if (versionSnapshots.length > 0) {
                // Determine the period boundaries
                const versionData = versions.packagingHistory.find(v => v.versionNumber === versionNumber);
                const targetPeriodIndex = periodIndex ?? 0;
                const period = versionData?.activePeriods?.[targetPeriodIndex];
                const periodStart = period?.startDate;
                const periodEnd = (targetPeriodIndex === 0) ? null : period?.endDate;

                // Filter snapshots within the period
                const periodSnapshots = versionSnapshots.filter(s =>
                    (periodStart === undefined || s.timestamp >= periodStart) &&
                    (!periodEnd || s.timestamp <= periodEnd)
                ).sort((a, b) => b.timestamp - a.timestamp);

                if (periodSnapshots.length > 0) {
                    // Auto-select the latest snapshot in this period
                    setSelectedSnapshot(periodSnapshots[0].id);
                } else {
                    setSelectedSnapshot(null);
                }
            } else {
                setSelectedSnapshot(null);
            }

            // Переключаем версию
            versions.switchToVersion(versionNumber, periodIndex);
        }
    }, [versions, isFormDirty, activeTab, selectedSnapshot, setSelectedSnapshot, onOpenSwitchConfirm, trafficState.trafficData?.snapshots]);

    /**
     * Подтверждение переключения версии (после discard changes)
     */
    const confirmSwitch = useCallback((targetVersion: number | 'draft') => {
        setSelectedSnapshot(null);
        versions.switchToVersion(targetVersion);
    }, [versions, setSelectedSnapshot]);

    /**
     * Обработчик удаления версии.
     * Проверяет наличие traffic snapshots для этой версии (только для опубликованных видео).
     */
    // Granular dependency: extract snapshots reference for stable useCallback
    const trafficSnapshots = trafficState.trafficData?.snapshots;

    const handleDeleteVersion = useCallback((versionNumber: number, versionLabel?: string) => {
        // Проверяем, есть ли связанные снепшоты трафика
        // Typed properly via TrafficData
        const relatedSnapshots = trafficSnapshots?.filter(
            s => s.version === versionNumber
        ) || [];

        // Legacy Stack Detection removed as we now do Group Deletion
        // Calculate "views generated by this version"
        // Logic: (Latest snapshot total views) - (Previous version's latest snapshot total views)
        let totalViews = 0;

        if (relatedSnapshots.length > 0) {
            // Get latest snapshot for current version
            const latestSnapshot = relatedSnapshots.sort((a, b) => b.timestamp - a.timestamp)[0];
            const currentTotalViews = latestSnapshot.summary?.totalViews || 0;

            // Get previous version's latest snapshot view count
            // Find snapshots for version < versionNumber
            const allSnapshots = trafficSnapshots || [];
            const previousVersionSnapshots = allSnapshots.filter(s => s.version < versionNumber);

            let previousTotalViews = 0;
            if (previousVersionSnapshots.length > 0) {
                const latestPrevSnapshot = previousVersionSnapshots.sort((a, b) => b.timestamp - a.timestamp)[0];
                previousTotalViews = latestPrevSnapshot.summary?.totalViews || 0;
            }

            // Delta
            totalViews = Math.max(0, currentTotalViews - previousTotalViews);
        }

        onOpenDeleteConfirm(versionNumber, relatedSnapshots.length, totalViews, versionLabel);
    }, [trafficSnapshots, onOpenDeleteConfirm]);

    /**
     * Подтверждение удаления версии.
     * Для опубликованных видео с traffic snapshots сохраняет packaging данные перед удалением.
     */
    const confirmDelete = useCallback(async (versionNumber: number) => {
        // GROUP DELETION LOGIC:
        // Find all versions that belong to the same "visual group" (same canonical ID)
        // and delete them all together.
        const targetVersionData = versions.packagingHistory.find(v => v.versionNumber === versionNumber);
        let versionsToDelete = [versionNumber];

        if (targetVersionData) {
            const canonicalId = targetVersionData.cloneOf || targetVersionData.versionNumber;
            const siblings = versions.packagingHistory.filter(v =>
                (v.cloneOf || v.versionNumber) === canonicalId
            );
            versionsToDelete = siblings.map(v => v.versionNumber);
        }

        // ATOMIC ATTEMPT
        if (user?.uid && currentChannel?.id && video.id) {
            const batch = writeBatch(db);
            const videoRef = VideoService.getVideoDocRef(user.uid, currentChannel.id, video.id);
            const trafficRef = TrafficDataService.getMainDocRef(user.uid, currentChannel.id, video.id);

            // 1. Prepare Traffic Updates if needed
            const snapshotsForVersions = trafficState.trafficData?.snapshots?.filter(
                s => versionsToDelete.includes(s.version)
            ) || [];

            if (snapshotsForVersions.length > 0 && trafficState.trafficData) {
                const updatedSnapshots = trafficState.trafficData.snapshots.map(s => {
                    if (versionsToDelete.includes(s.version)) {
                        const versionData = versions.packagingHistory.find(
                            v => v.versionNumber === s.version
                        );

                        // FIND THE SPECIFIC PERIOD this snapshot belongs to
                        const period = versionData?.activePeriods?.find(p =>
                            s.timestamp >= (p.startDate - 5000) &&
                            (!p.endDate || s.timestamp <= (p.endDate + 5000))
                        );


                        const packagingSnapshot = versionData?.configurationSnapshot;

                        if (packagingSnapshot) {
                            return {
                                ...s,
                                packagingSnapshot: {
                                    title: packagingSnapshot.title,
                                    description: packagingSnapshot.description,
                                    tags: packagingSnapshot.tags,
                                    coverImage: packagingSnapshot.coverImage,
                                    abTestTitles: packagingSnapshot.abTestTitles,
                                    abTestThumbnails: packagingSnapshot.abTestThumbnails,
                                    abTestResults: packagingSnapshot.abTestResults,
                                    localizations: packagingSnapshot.localizations,
                                    cloneOf: versionData.cloneOf,
                                    restoredAt: versionData.restoredAt,
                                    // NEW: Preserve the specific period context
                                    periodStart: period?.startDate || versionData.startDate,
                                    periodEnd: period?.endDate || (versionData.endDate ?? null)
                                },
                                isPackagingDeleted: true
                            };
                        }
                    }
                    return s;
                });

                // Sanitize whole object before batching to ensure NO undefined values
                const fullTrafficData = {
                    ...(trafficState.trafficData || {}),
                    snapshots: updatedSnapshots,
                    lastUpdated: Date.now()
                } as TrafficData;

                const sanitizedTrafficData = TrafficDataService.sanitize(fullTrafficData);

                batch.set(trafficRef, sanitizedTrafficData, { merge: true });


                // OPTIMISTIC UPDATE:
                // Update the local state immediately via the exposed method from useTrafficData.
                // This ensures the UI reflects the added metadata (periodStart/End) before the 
                // next fetch cycle, preventing "stale" snapshots from being rendered incorrectly.
                if (trafficState.updateLocalData) {
                    trafficState.updateLocalData(sanitizedTrafficData);
                }
            }

            // 2. Prepare Video Updates
            const deleteData = VersionService.calculateDeleteVersionData(
                versionsToDelete,
                versions.packagingHistory,
                typeof versions.activeVersion === 'number' ? versions.activeVersion : (video.currentPackagingVersion || 0)
            );

            batch.update(videoRef, {
                ...deleteData.rollbackUpdates,
                packagingHistory: deleteData.updatedHistory,
                currentPackagingVersion: deleteData.newCurrentVersion,
                isDraft: deleteData.willHaveDraft,
                packagingRevision: (video.packagingRevision || 0) + 1
            });

            try {
                // 3. Commit Batch
                await batch.commit();

                // 5. Update local state
                versions.deleteVersion(versionNumber);
                if (deleteData.newCurrentVersion) {
                    versions.setActiveVersion(deleteData.newCurrentVersion);
                }
                if (deleteData.newActiveVersion !== undefined) {
                    versions.setActiveVersion(deleteData.newActiveVersion);
                    const isViewingDeleted = typeof versions.viewingVersion === 'number' && versionsToDelete.includes(versions.viewingVersion);
                    if (isViewingDeleted) {
                        versions.switchToVersion(deleteData.newActiveVersion);
                    }
                }

                // 5. Invalidate Queries
                queryClient.invalidateQueries({ queryKey: ['video', video.id] });
                queryClient.invalidateQueries({ queryKey: ['traffic', video.id] });

                showToast(`Version group deleted`, 'success');
            } catch (error) {
                console.error('Failed to commit atomic deletion batch:', error);
                showToast('Failed to delete version', 'error');
            }
        }
    }, [versions, video, user, currentChannel, showToast, trafficState, queryClient]);

    /**
     * Обработчик восстановления версии
     */
    /**
     * Обработчик восстановления версии (Immutable Data Pattern).
     * Создает новую верси (клон) на основе старой.
     */
    const handleRestoreVersion = useCallback(async (versionToRestore: number) => {
        // IMMUTABLE RESTORE LOGIC (Clone/Alias Strategy)
        // We now always use cloning when restoring from history to maintain data integrity
        // and separate traffic snapshots for each activation period.

        // 1. Получаем данные исторической версии
        const targetVersionData = versions.packagingHistory.find(
            v => v.versionNumber === versionToRestore
        );

        if (!targetVersionData || !targetVersionData.configurationSnapshot) {
            showToast('Version data not found', 'error');
            return;
        }

        // STEP: Определяем активную версию для Snapshot Request
        let activeVersionToSnapshot: number | null = null;
        if (typeof versions.activeVersion === 'number') {
            activeVersionToSnapshot = versions.activeVersion;
        } else if (versions.activeVersion === 'draft') {
            // Fallback logic SAME AS usePackagingActions to be consistent
            if (versions.packagingHistory.length > 0) {
                const latestByDate = versions.packagingHistory.reduce<PackagingVersion | null>((best, current) => {
                    const currentStart = current.activePeriods?.reduce((max: number, p) =>
                        (p.startDate || 0) > (max || 0) ? (p.startDate || 0) : (max || 0)
                        , 0) || 0;
                    const bestStart = best?.activePeriods?.reduce((max: number, p) =>
                        (p.startDate || 0) > (max || 0) ? (p.startDate || 0) : (max || 0)
                        , 0) || 0;
                    return currentStart > bestStart ? current : best;
                }, null);

                if (latestByDate && (latestByDate.activePeriods?.length || 0) > 0) {
                    activeVersionToSnapshot = latestByDate.versionNumber;
                } else {
                    activeVersionToSnapshot = Math.max(...versions.packagingHistory.map(v => v.versionNumber));
                }
            }
        }

        // 2. Логика восстановления с запросом снепшота
        let closingSnapshotId: string | null | undefined = null;

        // Если есть активная версия (и это не та, которую мы восстанавливаем), предлагаем сохранить данные
        if (activeVersionToSnapshot && activeVersionToSnapshot !== versionToRestore && video.publishedVideoId) {
            const result = await new Promise<string | null | undefined>((resolve) => {
                onOpenSnapshotRequest({
                    versionToRestore, // Pass for context if needed, though mostly for legacy logic
                    isForCreateVersion: false, // It IS for restore, but we use 'false' to trigger restore callback flow? 
                    // ACTUALLY: The legacy hook logic is complex. 
                    // Let's keep it simple: We use a Promise here, same as createVersion.
                    resolveCallback: (id) => resolve(id),
                    versionNumber: activeVersionToSnapshot!,
                    context: 'restore'
                });
            });

            if (result === undefined) return; // Cancelled
            closingSnapshotId = result;
        }


        // 3. Update Local State (adds new active period to existing version)
        // Pass closingSnapshotId to close the PREVIOUS active period
        versions.restoreVersion(versionToRestore, closingSnapshotId);

        // ... (rest of the restore logic updates UI state)
        versions.setActiveVersion(versionToRestore);
        versions.setHasDraft(false);

        // 4. Update Firestore
        // We need to calculate the updated history with the new period added to the target version
        // and the previous active version closed.
        const updatedHistory = versions.packagingHistory.map(v => {
            if (v.versionNumber === versionToRestore) {
                return VersionService.addNewActivePeriod(VersionService.closeAllPeriods(v, closingSnapshotId));
            }
            return VersionService.closeAllPeriods(v, closingSnapshotId);
        });

        // 5. Сохраняем в Firestore
        if (user?.uid && currentChannel?.id && video.id) {
            try {
                await updateVideo({
                    videoId: video.id,
                    updates: {
                        packagingHistory: updatedHistory,
                        activeVersion: versionToRestore,
                        isDraft: false,
                        // Восстанавливаем данные на уровне полей видео (для UI превью)
                        title: targetVersionData.configurationSnapshot.title,
                        description: targetVersionData.configurationSnapshot.description,
                        tags: targetVersionData.configurationSnapshot.tags,
                        thumbnail: targetVersionData.configurationSnapshot.coverImage || '', // Changed from customImage
                        abTestTitles: targetVersionData.configurationSnapshot.abTestTitles,
                        abTestThumbnails: targetVersionData.configurationSnapshot.abTestThumbnails,
                        localizations: targetVersionData.configurationSnapshot.localizations
                    }
                });
                // 6. Toast
                showToast(`Restored v.${versionToRestore}`, 'success');
            } catch (error) {
                console.error("Failed to update video history on restore:", error);
                showToast("Failed to save restore to server", "error");
            }
        }
    }, [video, versions, user, currentChannel, updateVideo, showToast, onOpenSnapshotRequest]);

    return {
        handleVersionClick,
        confirmSwitch,
        handleDeleteVersion,
        confirmDelete,
        handleRestoreVersion
    };
};
