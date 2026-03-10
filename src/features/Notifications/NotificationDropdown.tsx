import React from 'react';
import { useNotificationStore, type Notification, type NotificationCategory } from '../../core/stores/notificationStore';
import { useUIStore } from '../../core/stores/uiStore';
import { NotificationItem } from './NotificationItem';
import { CheckCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type FilterTab = 'all' | 'channel' | 'trends' | 'smart-search' | 'checkin';

const FILTER_TABS: { key: FilterTab; label: string; categories: NotificationCategory[] }[] = [
    { key: 'all', label: 'All', categories: [] },
    { key: 'channel', label: 'Channel', categories: ['channel'] },
    { key: 'trends', label: 'Trends', categories: ['trends'] },
    { key: 'smart-search', label: 'Smart Search', categories: ['smart-search'] },
    { key: 'checkin', label: 'Check-ins', categories: ['checkin', 'video'] },
];

interface NotificationDropdownProps {
    onClose?: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onClose }) => {
    const { notifications, markAllAsRead } = useNotificationStore();
    const { openVideoModal, setSettingsOpen } = useUIStore();
    const navigate = useNavigate();

    const [activeFilter, setActiveFilter] = React.useState<FilterTab>('all');

    // Show filter tabs when there are notifications from 2+ categories
    const presentCategories = new Set(notifications.map(n => n.category).filter(Boolean));
    const showFilters = presentCategories.size >= 2;
    const effectiveFilter = showFilters ? activeFilter : 'all';

    const filteredNotifications = notifications.filter(n => {
        if (effectiveFilter === 'all') return true;
        const tab = FILTER_TABS.find(t => t.key === effectiveFilter);
        if (!tab || tab.categories.length === 0) return true;
        return tab.categories.includes(n.category!);
    });

    const handleRemoveAll = () => {
        // Only remove non-persistent notifications
        const idsToRemove = filteredNotifications
            .filter(n => !n.isPersistent)
            .map(n => n.id);

        if (idsToRemove.length > 0) {
            useNotificationStore.getState().removeNotifications(idsToRemove);
        }
    };

    const handleNotificationAction = (notification: Notification) => {
        if (!notification.link) return;

        if (notification.link === 'settings') {
            setSettingsOpen(true);
        } else if (notification.link.startsWith('/video/')) {
            const videoId = notification.link.split('/video/')[1];
            if (videoId) {
                // If it's a check-in notification, open packaging tab
                const isCheckin = notification.title.includes('Check-in');
                openVideoModal(videoId, isCheckin ? 'packaging' : 'details');
            }
        } else {
            navigate(notification.link);
        }
        onClose?.();
    };

    return (
        <div className="w-[400px] max-h-[600px] flex flex-col bg-bg-secondary rounded-xl shadow-2xl border border-border overflow-hidden animate-scale-in origin-top-right">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-bg-secondary/95 backdrop-blur sticky top-0 z-10 flex-shrink-0">
                <h3 className="font-medium text-text-primary">Notifications</h3>
                <div className="flex items-center gap-1">
                    {filteredNotifications.length > 0 && (
                        <>
                            <button
                                onClick={markAllAsRead}
                                className="p-2 rounded-full hover:bg-hover-bg text-text-secondary hover:text-text-primary transition-colors"
                                title="Mark all as read"
                            >
                                <CheckCheck size={18} />
                            </button>
                            <button
                                onClick={handleRemoveAll}
                                className="p-2 rounded-full hover:bg-hover-bg text-text-secondary hover:text-red-500 transition-colors"
                                title="Remove all"
                            >
                                <Trash2 size={18} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filter Tabs */}
            {showFilters && (
                <div className="px-4 py-2 border-b border-border flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
                    {FILTER_TABS.map(tab => {
                        // Only show tabs that have notifications (except "All")
                        if (tab.key !== 'all' && !tab.categories.some(c => presentCategories.has(c))) return null;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFilter(tab.key)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeFilter === tab.key
                                    ? 'bg-text-primary text-bg-primary'
                                    : 'hover:bg-hover-bg text-text-primary'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* List */}
            <div className="overflow-y-auto min-h-0">
                {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                        <CheckCheck size={48} className="mb-2 opacity-20" />
                        <p>No notifications</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filteredNotifications.map(notification => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onAction={handleNotificationAction}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
