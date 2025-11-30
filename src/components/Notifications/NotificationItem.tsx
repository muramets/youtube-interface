import React from 'react';
import { Trash2, Info, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotificationStore, type Notification } from '../../stores/notificationStore';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItemProps {
    notification: Notification;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({ notification }) => {
    const { markAsRead, removeNotification } = useNotificationStore();

    const getIcon = () => {
        switch (notification.type) {
            case 'error': return <AlertCircle size={20} className="text-red-500" />;
            case 'warning': return <AlertCircle size={20} className="text-yellow-500" />;
            case 'success': return <CheckCircle size={20} className="text-green-500" />;
            default: return <Info size={20} className="text-blue-500" />;
        }
    };

    return (
        <div
            onClick={() => !notification.isRead && markAsRead(notification.id)}
            className={`p-4 transition-colors flex gap-3 group relative cursor-pointer 
                ${!notification.isRead ? 'bg-blue-50/5 dark:bg-blue-900/10' : ''}
                hover:bg-hover-bg
            `}
        >
            {/* Unread Indicator */}
            {!notification.isRead && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-blue-500 rounded-r-full" />
            )}

            <div className="flex-shrink-0 mt-1">
                <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center border border-border">
                    {getIcon()}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary leading-tight mb-1">
                    {notification.title}
                </p>
                <p className="text-sm text-text-secondary line-clamp-2 mb-1">
                    {notification.message}
                </p>
                <p className="text-xs text-text-secondary">
                    {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                </p>
                {notification.meta && (
                    <p className="text-xs text-text-secondary mt-1 font-mono opacity-80">
                        {notification.meta}
                    </p>
                )}
            </div>

            <div className="flex-shrink-0 mt-1">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(notification.id);
                    }}
                    className="p-2 rounded-full hover:bg-hover-bg text-text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
};
