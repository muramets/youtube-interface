import { useEffect } from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import { useSettings } from './useSettings';

export const useAutoCleanup = () => {
    const { notifications, removeNotifications } = useNotificationStore();
    const { packagingSettings, isLoading: settingsLoading } = useSettings();

    useEffect(() => {
        // Wait for settings to load and notifications to exist
        if (settingsLoading || notifications.length === 0) return;

        // Debounce/block multiple runs?
        // Since notifications update when we delete, this effect will re-run.
        // We should ensure stability or use a ref to prevent loops if logic is flawed.
        // But logic is: Find Invalid -> Delete. Next run -> Invalid gone -> Nothing to delete.

        const cleanup = () => {
            const rules = new Set(packagingSettings.checkinRules.map(r => r.id));
            const idsToDelete: string[] = [];

            notifications.forEach(n => {
                // Internal ID format: checkin-due-{videoId}-{ruleId}
                // We check if it ends with a valid Rule ID (UUID) that is NOT in our rules set.
                if (n.internalId && n.internalId.startsWith('checkin-due-') && n.internalId.length > 36) {
                    // Extract the last 36 chars (UUID length)
                    const ruleId = n.internalId.slice(-36);

                    // Verify if it looks like a rule ID (UUID length)
                    // Rule ID is UUID (36 chars).
                    if (ruleId.length === 36) {
                        // Double check it's actually a UUID (contains dashes) to be safe
                        if (ruleId.includes('-')) {
                            if (!rules.has(ruleId)) {
                                idsToDelete.push(n.id);
                            }
                        }
                    }
                }
            });

            if (idsToDelete.length > 0) {
                removeNotifications(idsToDelete);
            }
        };

        // Run cleanup
        cleanup();

    }, [notifications, packagingSettings, settingsLoading, removeNotifications]);
};
