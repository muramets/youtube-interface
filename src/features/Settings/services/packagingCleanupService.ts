// =============================================================================
// Packaging Cleanup Service
// Removes duplicate and orphaned check-ins from video packaging history
// =============================================================================

import { VideoService } from '../../../core/services/videoService';
import { NotificationService } from '../../../core/services/notificationService';
import { logger } from '../../../core/utils/logger';
import type { PackagingCheckin } from '../../../core/types/versioning';

const isCheckinEmpty = (checkin: {
    metrics?: {
        impressions?: number | null;
        ctr?: number | null;
        views?: number | null;
        avdSeconds?: number | null;
    };
}): boolean => {
    const m = checkin.metrics;
    if (!m) return true;
    return (m.impressions === null || m.impressions === undefined) &&
        (m.ctr === null || m.ctr === undefined) &&
        (m.views === null || m.views === undefined) &&
        (m.avdSeconds === null || m.avdSeconds === undefined);
};

/**
 * Cleans up packaging check-in data across all videos:
 * 1. Removes duplicate check-ins (keeps earliest with metrics)
 * 2. Removes orphaned empty check-ins (rule deleted from settings)
 * 3. Cleans up related notifications
 *
 * @param silent - true for auto-cleanup on save (no logging), false for manual trigger
 */
export const cleanOrphanedCheckins = async (
    userId: string,
    channelId: string,
    validRuleIds: Set<string>,
    silent = false
): Promise<void> => {
    const freshVideos = await VideoService.fetchVideos(userId, channelId);

    const notificationIdsToDelete: string[] = [];
    const cleanupPromises: Promise<void>[] = [];

    for (const video of freshVideos) {
        if (!video.packagingHistory || video.packagingHistory.length === 0) continue;

        // 1. Identify duplicates across all versions
        const allCheckins: { checkin: PackagingCheckin; versionIndex: number }[] = [];
        video.packagingHistory.forEach((v, vIdx) => {
            v.checkins?.forEach((c: PackagingCheckin) => allCheckins.push({ checkin: c, versionIndex: vIdx }));
        });

        const checkinIdsToDelete = new Set<string>();

        // Group by ruleId
        const rulesMap = new Map<string, typeof allCheckins>();
        allCheckins.forEach(item => {
            if (!item.checkin.ruleId) return;
            if (!rulesMap.has(item.checkin.ruleId)) rulesMap.set(item.checkin.ruleId, []);
            rulesMap.get(item.checkin.ruleId)?.push(item);
        });

        // Resolve duplicates: keep earliest with metrics, or earliest overall
        for (const [ruleId, items] of rulesMap) {
            if (items.length > 1) {
                const withMetrics = items.filter(i => !isCheckinEmpty(i.checkin));

                let survivor;
                if (withMetrics.length > 0) {
                    withMetrics.sort((a, b) => a.checkin.date - b.checkin.date);
                    survivor = withMetrics[0];
                } else {
                    items.sort((a, b) => a.checkin.date - b.checkin.date);
                    survivor = items[0];
                }

                items.forEach(i => {
                    if (i.checkin.id !== survivor.checkin.id) {
                        checkinIdsToDelete.add(i.checkin.id);
                        if (!silent) logger.info('[Cleanup] Marking duplicate checkin for deletion', { videoId: video.id, ruleId, checkinId: i.checkin.id });
                    }
                });
            }
        }

        // 2. Filter out duplicates and orphaned empty check-ins
        let hasChanges = false;
        const newHistory = video.packagingHistory.map((version) => {
            const cleanedCheckins = (version.checkins || []).filter((checkin: PackagingCheckin) => {
                if (checkinIdsToDelete.has(checkin.id)) {
                    hasChanges = true;
                    return false;
                }

                // Manual check-ins (no ruleId) are always kept
                if (!checkin.ruleId) return true;

                // If rule exists in settings, keep it
                if (validRuleIds.has(checkin.ruleId)) return true;

                // Rule is MISSING from settings — check if empty
                if (!isCheckinEmpty(checkin)) return true; // has data → keep (safety)

                // Orphaned AND empty → remove
                notificationIdsToDelete.push(`checkin-due-${video.id}-${checkin.ruleId}`);
                hasChanges = true;
                return false;
            });
            return { ...version, checkins: cleanedCheckins };
        });

        if (hasChanges) {
            if (!silent) logger.info('[Cleanup] Updating video history', { videoId: video.id });
            cleanupPromises.push(
                VideoService.updateVideo(userId, channelId, video.id, { packagingHistory: newHistory })
            );
        }
    }

    await Promise.all(cleanupPromises);

    // 3. Clean up related notifications
    if (notificationIdsToDelete.length > 0) {
        try {
            await NotificationService.removeNotifications(userId, channelId, notificationIdsToDelete);
            if (!silent) logger.info('[Cleanup] Removed notifications', { count: notificationIdsToDelete.length });
        } catch (error) {
            logger.error('[Cleanup] Failed to remove notifications:', { error });
        }
    }
};
