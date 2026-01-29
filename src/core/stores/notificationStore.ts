import { create } from 'zustand';
import { NotificationService } from '../services/notificationService';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    timestamp: number;
    isRead: boolean;
    link?: string;
    meta?: string;
    thumbnail?: string;
    avatarUrl?: string;
    quotaBreakdown?: {
        search?: number;
        list?: number;
        details?: number;
    };
    isPersistent?: boolean;
    internalId?: string;
    customColor?: string;
}

interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    activeUserId: string | null;
    activeChannelId: string | null;

    subscribeToNotifications: (userId: string, channelId: string) => () => void;
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    removeNotification: (id: string) => Promise<void>;
    removeNotifications: (ids: string[]) => Promise<void>;
    removeNotificationByInternalId: (internalId: string) => Promise<void>;
    clearAll: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    activeUserId: null,
    activeChannelId: null,

    subscribeToNotifications: (userId, channelId) => {
        set({ activeUserId: userId, activeChannelId: channelId });
        return NotificationService.subscribeToNotifications(userId, channelId, (notifications) => {
            const unreadCount = notifications.filter(n => !n.isRead).length;
            set({ notifications, unreadCount });
        });
    },

    addNotification: async (notification) => {
        const { activeUserId, activeChannelId } = get();
        if (!activeUserId || !activeChannelId) return;
        await NotificationService.addNotification(activeUserId, activeChannelId, notification);
    },

    markAsRead: async (id) => {
        const { activeUserId, activeChannelId } = get();
        if (!activeUserId || !activeChannelId) return;
        await NotificationService.markAsRead(activeUserId, activeChannelId, id);
    },

    markAllAsRead: async () => {
        const { activeUserId, activeChannelId, notifications } = get();
        if (!activeUserId || !activeChannelId) return;
        const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
        if (unreadIds.length > 0) {
            await NotificationService.markAllAsRead(activeUserId, activeChannelId, unreadIds);
        }
    },

    removeNotification: async (id) => {
        const { activeUserId, activeChannelId } = get();
        if (!activeUserId || !activeChannelId) return;
        await NotificationService.removeNotification(activeUserId, activeChannelId, id);
    },

    removeNotifications: async (ids) => {
        const { activeUserId, activeChannelId } = get();
        if (!activeUserId || !activeChannelId) return;
        await NotificationService.removeNotifications(activeUserId, activeChannelId, ids);
    },

    clearAll: async () => {
        const { activeUserId, activeChannelId, notifications } = get();
        if (!activeUserId || !activeChannelId) return;
        // Only clear non-persistent notifications
        const ids = notifications.filter(n => !n.isPersistent).map(n => n.id);
        if (ids.length > 0) {
            await NotificationService.clearAll(activeUserId, activeChannelId, ids);
        }
    },

    removeNotificationByInternalId: async (internalId: string) => {
        const { activeUserId, activeChannelId, notifications } = get();
        if (!activeUserId || !activeChannelId) return;

        const notification = notifications.find(n => n.internalId === internalId);
        if (notification) {
            await NotificationService.removeNotification(activeUserId, activeChannelId, notification.id);
        }
    }
}));
