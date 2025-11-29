import React from 'react';
import { useNotificationStore } from '../../stores/notificationStore';
import { NotificationItem } from './NotificationItem';
import { CheckCheck, Trash2 } from 'lucide-react';

export const NotificationDropdown: React.FC = () => {
    const { notifications, markAllAsRead } = useNotificationStore();

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
        const idsToRemove = filteredNotifications.map(n => n.id);
        useNotificationStore.getState().removeNotifications(idsToRemove);
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
            <div className="overflow-y-auto flex-1">
                {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-text-secondary text-center">
                        <div className="w-16 h-16 rounded-full bg-hover-bg flex items-center justify-center mb-4">
                            <CheckCheck size={32} className="opacity-50" />
                        </div>
                        <p className="font-medium mb-1">No notifications</p>
                        <p className="text-sm">You're all caught up!</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filteredNotifications.map((notification) => (
                            <NotificationItem key={notification.id} notification={notification} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
