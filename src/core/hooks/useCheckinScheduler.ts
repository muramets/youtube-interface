import { useEffect, useRef } from 'react';
import { useVideos } from './useVideos';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';

import { useSettings } from './useSettings';
import { useNotificationStore, type Notification } from '../stores/notificationStore';
import { calculateDueDate } from '../utils/dueDateUtils';

export const useCheckinScheduler = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { packagingSettings } = useSettings();
    const { notifications } = useNotificationStore();

    const processedIdsRef = useRef(new Set<string>());

    useEffect(() => {
        const checkDueCheckins = async () => {
            const store = useNotificationStore.getState();
            const currentNotifications = store.notifications;
            const now = Date.now();
            const customVideos = videos.filter(v => v.isCustom && v.publishedVideoId);

            // Collect batch operations to minimize Firestore writes and onSnapshot triggers
            const toCreate: Omit<Notification, 'id' | 'timestamp' | 'isRead'>[] = [];
            const toRemoveIds: string[] = [];

            for (const video of customVideos) {
                const publishedAt = video.publishedAt;
                if (!publishedAt) continue;

                // Failed videos (deleted/private on YouTube): clean up existing notifications, skip creation
                if (video.fetchStatus === 'failed') {
                    for (const rule of packagingSettings.checkinRules) {
                        const notificationId = `checkin-due-${video.id}-${rule.id}`;
                        const existing = currentNotifications.find(n => n.internalId === notificationId);
                        if (existing) toRemoveIds.push(existing.id);
                    }
                    continue;
                }

                for (const rule of packagingSettings.checkinRules) {
                    const dueTime = calculateDueDate(publishedAt, rule.hoursAfterPublish);
                    const notificationId = `checkin-due-${video.id}-${rule.id}`;

                    // Snapshot-based completion: Traffic Sources CSV is required (always available in YT Studio).
                    // Suggested Traffic is optional (may not exist for low-view videos).
                    // Grace period: upload within 6 hours before due time counts as complete
                    // (user uploaded on the right day, just slightly before the exact hour mark).
                    const GRACE_MS = 6 * 60 * 60 * 1000;
                    const isComplete = (video.lastTrafficSourceUpload ?? 0) >= (dueTime - GRACE_MS);

                    if (isComplete) {
                        const existing = currentNotifications.find(n => n.internalId === notificationId);
                        if (existing) toRemoveIds.push(existing.id);
                        processedIdsRef.current.delete(notificationId);
                        continue;
                    }

                    if (now < dueTime) continue;

                    const alreadyNotified = currentNotifications.some(n => n.internalId === notificationId);
                    if (alreadyNotified || processedIdsRef.current.has(notificationId)) continue;

                    processedIdsRef.current.add(notificationId);
                    toCreate.push({
                        title: 'Packaging Check-in Due',
                        message: `Time to check in on "${video.title}" (${rule.badgeText})`,
                        type: 'info',
                        link: `/video/${currentChannel!.id}/${video.id}/details?tab=packaging`,
                        internalId: notificationId,
                        customColor: rule.badgeColor,
                        thumbnail: video.thumbnail || video.customImage,
                        isPersistent: true,
                        category: 'checkin'
                    });
                }
            }

            // Single batch write → one onSnapshot → all notifications appear at once
            if (toCreate.length > 0) {
                try {
                    await store.addNotificationsBatch(toCreate);
                } catch (e) {
                    toCreate.forEach(n => { if (n.internalId) processedIdsRef.current.delete(n.internalId); });
                    console.error("Failed to batch-add notifications", e);
                }
            }

            if (toRemoveIds.length > 0) {
                try {
                    await store.removeNotifications(toRemoveIds);
                } catch (e) {
                    console.error("Failed to batch-remove notifications", e);
                }
            }
        };

        checkDueCheckins();
        const interval = setInterval(checkDueCheckins, 60000);

        return () => clearInterval(interval);
    }, [videos, packagingSettings, currentChannel]);

    // Cleanup Effect: Auto-remove duplicates
    // This handles the transition from Random IDs to Deterministic IDs
    useEffect(() => {
        const deduplicate = async () => {
            const groups = new Map<string, typeof notifications>();

            notifications.forEach(n => {
                if (n.internalId && n.internalId.startsWith('checkin-due-')) {
                    const group = groups.get(n.internalId) || [];
                    group.push(n);
                    groups.set(n.internalId, group);
                }
            });

            const idsToDelete: string[] = [];

            for (const [internalId, group] of groups.entries()) {
                if (group.length > 1) {
                    // Strategy: Prefer the "Idempotent" one (ID === InternalID)
                    const idempotentMatch = group.find(n => n.id === internalId);

                    if (idempotentMatch) {
                        // Keep the idempotent one, remove all leftovers
                        group.forEach(n => {
                            if (n.id !== internalId) idsToDelete.push(n.id);
                        });
                    } else {
                        // Fallback: Keep the newest one
                        group.sort((a, b) => b.timestamp - a.timestamp);
                        // Remove all except the first (newest)
                        for (let i = 1; i < group.length; i++) {
                            idsToDelete.push(group[i].id);
                        }
                    }
                }
            }

            if (idsToDelete.length > 0) {
                // Use getState() to access the action directly without adding it to dependencies
                useNotificationStore.getState().removeNotifications(idsToDelete);
            }
        };

        // Debounce slightly to allow initial load to settle
        const timeoutId = setTimeout(deduplicate, 2000);
        return () => clearTimeout(timeoutId);
    }, [notifications]);
};
