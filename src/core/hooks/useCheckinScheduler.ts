import { useEffect, useRef } from 'react';
import { useVideos } from './useVideos';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';

import { useSettings } from './useSettings';
import { useNotificationStore } from '../stores/notificationStore';
import { calculateDueDate } from '../utils/dueDateUtils';

export const useCheckinScheduler = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos, updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { packagingSettings } = useSettings();
    const { notifications, addNotification, removeNotification } = useNotificationStore();

    const processedIdsRef = useRef(new Set<string>());

    useEffect(() => {
        const checkDueCheckins = async () => {
            const now = Date.now();
            const customVideos = videos.filter(v => v.isCustom && v.publishedVideoId);

            for (const video of customVideos) {
                // Use YouTube's publishedAt from mergedVideoData if available, fallback to video.publishedAt
                const publishedAt = video.mergedVideoData?.publishedAt || video.publishedAt;
                if (!publishedAt) continue;

                for (const rule of packagingSettings.checkinRules) {
                    // Calculate due time using utility that accounts for YouTube analytics update at 12:00
                    const dueTime = calculateDueDate(publishedAt, rule.hoursAfterPublish);

                    const notificationId = `checkin-due-${video.id}-${rule.id}`;

                    // Check if this check-in has already been done (exists in history)
                    const videoHistory = video.packagingHistory || [];
                    let existingCheckin = videoHistory.flatMap(v => v.checkins || []).find(c => c.ruleId === rule.id);

                    const isCheckinComplete = existingCheckin && (existingCheckin.metrics.ctr !== null || existingCheckin.metrics.impressions !== null || existingCheckin.metrics.views !== null);

                    if (isCheckinComplete) {
                        // If job is done, remove the notification if it exists
                        const existingNotification = notifications.find(n => n.internalId === notificationId);
                        if (existingNotification) {
                            await removeNotification(existingNotification.id);
                        }
                        processedIdsRef.current.delete(notificationId);
                        continue;
                    }

                    // If it's not due yet, skip
                    if (now < dueTime) {
                        continue;
                    }

                    // It IS due (or past due).

                    // CRITICAL CHANGE: If it's due but MISSING in DB, we must CREATE it now.
                    // This ensures Notification implies Checkin Row Exists.
                    if (!existingCheckin) {
                        // We need to add it to the LATEST version.
                        // Clone history to avoid mutation
                        const newHistory = JSON.parse(JSON.stringify(videoHistory));
                        if (newHistory.length === 0) continue; // Should have history if custom? If not, maybe skip or create v1? Let's skip for safety if no version exists.

                        // Sort by version desc
                        newHistory.sort((a: { versionNumber: number }, b: { versionNumber: number }) => b.versionNumber - a.versionNumber);
                        const latestVersion = newHistory[0];

                        const newCheckin = {
                            id: crypto.randomUUID(),
                            date: dueTime, // Use the scheduled time, not 'now', for accuracy
                            metrics: {
                                impressions: null,
                                ctr: null,
                                views: null,
                                avdSeconds: null
                            },
                            ruleId: rule.id
                        };

                        latestVersion.checkins.push(newCheckin);
                        // Sort checkins by date
                        latestVersion.checkins.sort((a: { date: number }, b: { date: number }) => a.date - b.date);

                        // Update DB
                        try {
                            await updateVideo({
                                videoId: video.id,
                                updates: { packagingHistory: newHistory }
                            });
                            // Update local reference immediately so we don't try to add it again in next loop iteration (if it runs fast)
                            existingCheckin = newCheckin;
                        } catch (e) {
                            console.error("Failed to auto-create checkin row", e);
                            continue; // Retry next loop
                        }
                    }

                    // Now check Notification status
                    const alreadyNotified = notifications.some(n => n.internalId === notificationId);
                    const isProcessing = processedIdsRef.current.has(notificationId);

                    if (alreadyNotified || isProcessing) continue;

                    processedIdsRef.current.add(notificationId);

                    try {
                        await addNotification({
                            title: 'Packaging Check-in Due',
                            message: `Time to check in on "${video.title}" (${rule.badgeText})`,
                            type: 'info',
                            link: `/video/${video.id}`,
                            internalId: notificationId,
                            customColor: rule.badgeColor,
                            thumbnail: video.thumbnail || video.customImage,
                            isPersistent: true
                        });
                    } catch (e) {
                        processedIdsRef.current.delete(notificationId);
                        console.error("Failed to add notification", e);
                    }
                }
            }
        };

        checkDueCheckins();
        const interval = setInterval(checkDueCheckins, 60000);

        return () => clearInterval(interval);
    }, [videos, packagingSettings, notifications, addNotification, removeNotification, updateVideo]);

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
