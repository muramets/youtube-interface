import { useEffect } from 'react';
import { useVideosStore } from '../stores/videosStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useNotificationStore } from '../stores/notificationStore';

export const useCheckinScheduler = () => {
    const { videos } = useVideosStore();
    const { packagingSettings } = useSettingsStore();
    const { notifications, addNotification } = useNotificationStore();

    useEffect(() => {
        const checkDueCheckins = async () => {
            const now = Date.now();
            const customVideos = videos.filter(v => v.isCustom && v.publishedAt);

            for (const video of customVideos) {
                if (!video.publishedAt) continue;
                const publishTime = new Date(video.publishedAt).getTime();

                for (const rule of packagingSettings.checkinRules) {
                    const dueTime = publishTime + (rule.hoursAfterPublish * 60 * 60 * 1000);

                    // If it's not due yet, skip
                    if (now < dueTime) continue;

                    // Check if this check-in has already been done
                    // We look for a check-in in the history that matches the rule's badge text
                    // This is a heuristic; ideally we'd link check-ins to rules explicitly
                    // const hasCheckin = video.packagingHistory?.some(version => 
                    //     version.checkins.some(checkin => checkin.badge?.text === rule.badgeText)
                    // );

                    // if (hasCheckin) continue;

                    // Check if we already notified about this
                    const notificationId = `checkin-due-${video.id}-${rule.id}`;
                    const alreadyNotified = notifications.some(n => n.meta === notificationId);

                    if (alreadyNotified) continue;

                    // Trigger notification
                    await addNotification({
                        title: 'Packaging Check-in Due',
                        message: `Time to check in on "${video.title}" (${rule.badgeText})`,
                        type: 'info',
                        link: `/video/${video.id}`, // Or open modal directly if possible
                        meta: notificationId
                    });
                }
            }
        };

        // Run immediately and then every minute
        checkDueCheckins();
        const interval = setInterval(checkDueCheckins, 60000);

        return () => clearInterval(interval);
    }, [videos, packagingSettings, notifications, addNotification]);
};
