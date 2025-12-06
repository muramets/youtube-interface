import React from 'react';
import { Trash2, Info, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotificationStore, type Notification } from '../../stores/notificationStore';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItemProps {
    notification: Notification;
    onAction?: (notification: Notification) => void;
}

import { useSettings } from '../../hooks/useSettings';

export const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onAction }) => {
    const { markAsRead, removeNotification } = useNotificationStore();
    const { packagingSettings } = useSettings();

    const effectiveColor = React.useMemo(() => {
        if (notification.internalId?.startsWith('checkin-due-')) {
            const rule = packagingSettings.checkinRules.find(r => notification.internalId?.endsWith(`-${r.id}`));
            if (rule) return rule.badgeColor;
        }
        return notification.customColor;
    }, [notification.internalId, notification.customColor, packagingSettings.checkinRules]);

    const getIcon = () => {
        switch (notification.type) {
            case 'error': return <AlertCircle size={20} className="text-red-500" />;
            case 'warning': return <AlertCircle size={20} className="text-yellow-500" />;
            case 'success': return <CheckCircle size={20} className="text-green-500" />;
            default: return <Info size={20} className={effectiveColor ? '' : "text-blue-500"} style={{ color: effectiveColor }} />;
        }
    };

    const handleClick = () => {
        if (!notification.isRead) {
            markAsRead(notification.id);
        }
        onAction?.(notification);
    };

    return (
        <div
            onClick={handleClick}
            className={`p-4 transition-colors flex gap-3 group relative cursor-pointer items-center
                hover:bg-hover-bg
            `}
            style={{
                backgroundColor: !notification.isRead
                    ? (effectiveColor ? `${effectiveColor}08` : 'rgba(59, 130, 246, 0.05)')
                    : undefined
            }}
        >
            {/* Unread Indicator */}
            {!notification.isRead && (
                <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-r-full"
                    style={{ backgroundColor: effectiveColor || '#3b82f6' }}
                />
            )}

            {/* Icon / Thumbnail Section */}
            <div className="flex-shrink-0">
                {notification.thumbnail ? (
                    <div className="relative group/image">
                        <div
                            className="w-24 aspect-video rounded-md overflow-hidden bg-bg-secondary shadow-sm border transition-colors"
                            style={{
                                borderColor: effectiveColor ? `${effectiveColor}80` : 'rgba(var(--border), 0.5)'
                            }}
                        >
                            <img
                                src={notification.thumbnail}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        </div>
                        {/* Icon Badge Overlay */}
                        <div
                            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-bg-primary flex items-center justify-center shadow-sm border border-border"
                            style={effectiveColor ? {
                                color: effectiveColor,
                                borderColor: `${effectiveColor}30`
                            } : undefined}
                        >
                            {React.cloneElement(getIcon() as React.ReactElement, { size: 14 })}
                        </div>
                    </div>
                ) : (
                    <div
                        className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center border border-border"
                        style={effectiveColor ? {
                            backgroundColor: `${effectiveColor}15`,
                            borderColor: `${effectiveColor}30`,
                            color: effectiveColor
                        } : undefined}
                    >
                        {getIcon()}
                    </div>
                )}
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
                    <p className="text-xs text-text-secondary mt-1 font-mono bg-bg-secondary inline-block px-1 rounded border border-border">
                        {notification.meta}
                    </p>
                )}
            </div>

            <div className="flex-shrink-0">
                {!notification.isPersistent && (
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
                )}
            </div>
        </div>
    );
};
