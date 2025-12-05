import { useEffect, useRef } from 'react';
import { useVideos } from './useVideos';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';

import { useSettings } from './useSettings';
import { useNotificationStore } from '../stores/notificationStore';

export const useCheckinScheduler = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { packagingSettings } = useSettings();
    const { notifications, addNotification, removeNotification } = useNotificationStore();

    const processedIdsRef = useRef(new Set<string>());

    useEffect(() => {
        const checkDueCheckins = async () => {
            const now = Date.now();
            const customVideos = videos.filter(v => v.isCustom && v.publishedAt);

            for (const video of customVideos) {
                if (!video.publishedAt) continue;
                const publishTime = new Date(video.publishedAt).getTime();

                for (const rule of packagingSettings.checkinRules) {
                    const dueTime = publishTime + (rule.hoursAfterPublish * 60 * 60 * 1000);

                    // Logic: Level-Triggered Notification
                    // If Check-in is DONE -> Ensure Notification is GONE
                    // If Check-in is DUE && NOT DONE -> Ensure Notification is PRESENT

                    const notificationId = `checkin-due-${video.id}-${rule.id}`;

                    // Check if this check-in has already been done
                    const hasCheckin = video.packagingHistory?.some(version =>
                        version.checkins.some(checkin => checkin.ruleId === rule.id)
                    );

                    if (hasCheckin) {
                        // If job is done, remove the notification if it exists
                        const existingNotification = notifications.find(n => n.internalId === notificationId);
                        if (existingNotification) {
                            await removeNotification(existingNotification.id);
                        }
                        // Also clear from local ref so we can notify again if it somehow gets undone?
                        // Unlikely, but good for cleanup.
                        processedIdsRef.current.delete(notificationId);
                        continue;
                    }

                    // If it's not due yet, skip
                    if (now < dueTime) continue;

                    // It IS due and NOT done.

                    // Check if we already notified about this (Store OR Local Ref)
                    const alreadyNotified = notifications.some(n => n.internalId === notificationId);
                    const isProcessing = processedIdsRef.current.has(notificationId);

                    if (alreadyNotified || isProcessing) continue;

                    // Mark as processing IMMEDIATELY to stop race conditions
                    processedIdsRef.current.add(notificationId);

                    try {
                        // Trigger notification
                        await addNotification({
                            title: 'Packaging Check-in Due',
                            message: `Time to check in on "${video.title}" (${rule.badgeText})`,
                            type: 'info',
                            link: `/video/${video.id}`, // Or open modal directly if possible
                            internalId: notificationId,
                            customColor: rule.badgeColor
                        });
                    } catch (e) {
                        // If failed, remove from processing so we can retry ?
                        // Or just let it fail. Better to retry next loop.
                        processedIdsRef.current.delete(notificationId);
                        console.error("Failed to add notification", e);
                    }
                }
            }
        };

        // Run immediately and then every minute
        checkDueCheckins();
        const interval = setInterval(checkDueCheckins, 60000);

        return () => clearInterval(interval);
    }, [videos, packagingSettings, notifications, addNotification, removeNotification]);
};
