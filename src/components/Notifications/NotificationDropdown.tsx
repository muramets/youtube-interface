import React from 'react';
import { useNotificationStore, type Notification } from '../../stores/notificationStore';
import { useUIStore } from '../../stores/uiStore';
import { NotificationItem } from './NotificationItem';
import { CheckCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NotificationDropdownProps {
    onClose?: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onClose }) => {
    const { notifications, markAllAsRead } = useNotificationStore();
    const { openVideoModal, setSettingsOpen } = useUIStore();
    const navigate = useNavigate();

    const [activeFilter, setActiveFilter] = React.useState<'All' | 'Sync'>('All');

    const hasSyncNotifications = notifications.some(n => n.title.includes('Sync'));
    const showFilters = hasSyncNotifications;
    const effectiveFilter = showFilters ? activeFilter : 'All';

    const filteredNotifications = notifications.filter(n => {
        if (effectiveFilter === 'All') return true;
        if (effectiveFilter === 'Sync') return n.title.includes('Sync');
        return true;
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
                    <button
                        onClick={() => setActiveFilter('All')}
                        className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeFilter === 'All'
                            ? 'bg-text-primary text-bg-primary'
                            : 'hover:bg-hover-bg text-text-primary'
                            }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setActiveFilter('Sync')}
                        className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeFilter === 'Sync'
                            ? 'bg-text-primary text-bg-primary'
                            : 'hover:bg-hover-bg text-text-primary'
                            }`}
                    >
                        Sync
                    </button>
                </div>
            )}

            {/* List */}
            <div className="overflow-y-auto flex-1 min-h-0">
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
