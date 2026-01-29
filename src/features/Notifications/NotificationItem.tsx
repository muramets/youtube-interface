import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Trash2, Info, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotificationStore, type Notification } from '../../core/stores/notificationStore';
import { formatDistanceToNow } from 'date-fns';

interface NotificationItemProps {
    notification: Notification;
    onAction?: (notification: Notification) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onAction }) => {
    const { markAsRead, removeNotification } = useNotificationStore();
    const navigate = useNavigate();

    const effectiveColor = React.useMemo(() => {
        if (notification.type === 'success') return '#22c55e'; // green-500
        return notification.customColor;
    }, [notification.customColor, notification.type]);

    const getIcon = (size: number = 20) => {
        switch (notification.type) {
            case 'error': return <AlertCircle size={size} className="text-red-500" />;
            case 'warning': return <AlertCircle size={size} className="text-yellow-500" />;
            case 'success': return <CheckCircle size={size} className="text-green-500" />;
            default: return <Info size={size} className={effectiveColor ? '' : "text-blue-500"} style={{ color: effectiveColor }} />;
        }
    };

    const handleClick = () => {
        if (!notification.isRead) {
            markAsRead(notification.id);
        }

        if (notification.link) {
            navigate(notification.link);
        }

        onAction?.(notification);
    };

    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const badgeRef = useRef<HTMLDivElement>(null);

    // Message Tooltip State
    const [showMessageTooltip, setShowMessageTooltip] = useState(false);
    const [messageTooltipPos, setMessageTooltipPos] = useState({ top: 0, left: 0 });
    const messageRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
        if (badgeRef.current) {
            const rect = badgeRef.current.getBoundingClientRect();
            setTooltipPos({
                top: rect.bottom + window.scrollY + 5,
                left: rect.left + window.scrollX
            });
            setShowTooltip(true);
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    // Timeout ref for delayed tooltip
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMessageMouseEnter = () => {
        if (messageRef.current) {
            const rect = messageRef.current.getBoundingClientRect();

            // Calculate position immediately
            setMessageTooltipPos({
                top: rect.top + window.scrollY - 2,
                left: rect.left + window.scrollX
            });

            // Delay showing the tooltip by 1000ms
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = setTimeout(() => {
                setShowMessageTooltip(true);
            }, 1000);
        }
    };

    const handleMessageMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setShowMessageTooltip(false);
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
                            {getIcon(14)}
                        </div>
                    </div>
                ) : (
                    <div
                        className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center border border-border overflow-hidden"
                        style={effectiveColor ? {
                            backgroundColor: `${effectiveColor}15`,
                            borderColor: `${effectiveColor}30`,
                            color: effectiveColor
                        } : undefined}
                    >
                        {notification.avatarUrl ? (
                            <img src={notification.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            getIcon()
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary leading-tight mb-1">
                    {notification.title}
                </p>
                <div
                    ref={messageRef}
                    className="relative group/message"
                    onMouseEnter={handleMessageMouseEnter}
                    onMouseLeave={handleMessageMouseLeave}
                >
                    <p className="text-sm text-text-secondary line-clamp-2 mb-1">
                        {notification.message}
                    </p>

                    {/* Tooltip via Portal to avoid clipping */}
                    {showMessageTooltip && createPortal(
                        <div
                            className="fixed z-max px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl pointer-events-none max-w-[300px] animate-in fade-in zoom-in-95 duration-100"
                            style={{
                                top: messageTooltipPos.top,
                                left: messageTooltipPos.left,
                                transform: 'translateY(-100%)'
                            }}
                        >
                            <p className="text-xs text-white whitespace-normal break-words leading-relaxed">{notification.message}</p>
                        </div>,
                        document.body
                    )}
                </div>
                <p className="text-xs text-text-secondary">
                    {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                </p>
                {notification.meta && (
                    <div className="flex items-center gap-1.5 mt-2 relative group/quota">
                        <span className="text-[10px] font-bold tracking-wider text-text-tertiary uppercase opacity-50">
                            Quota used:
                        </span>
                        <div
                            ref={badgeRef}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            className="px-1.5 py-0.5 rounded border border-green-500/20 bg-green-500/10 cursor-help transition-colors hover:bg-green-500/20"
                        >
                            <p className="text-[10px] text-green-400 font-mono">
                                {notification.meta} units
                            </p>
                        </div>

                        {/* Quota Breakdown Tooltip - Portal */}
                        {notification.quotaBreakdown && showTooltip && createPortal(
                            <div
                                className="fixed z-[9999] p-2 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl pointer-events-none min-w-[120px] animate-in fade-in zoom-in-95 duration-100"
                                style={{
                                    top: tooltipPos.top,
                                    left: tooltipPos.left,
                                }}
                            >
                                <div className="space-y-1">
                                    {notification.quotaBreakdown.search && (
                                        <div className="flex justify-between items-center gap-4">
                                            <span className="text-[10px] text-text-tertiary">Search:</span>
                                            <span className="text-[10px] text-white font-mono">{notification.quotaBreakdown.search}</span>
                                        </div>
                                    )}
                                    {notification.quotaBreakdown.list && (
                                        <div className="flex justify-between items-center gap-4">
                                            <span className="text-[10px] text-text-tertiary">Video List:</span>
                                            <span className="text-[10px] text-white font-mono">{notification.quotaBreakdown.list}</span>
                                        </div>
                                    )}
                                    {notification.quotaBreakdown.details && (
                                        <div className="flex justify-between items-center gap-4">
                                            <span className="text-[10px] text-text-tertiary">Video Details:</span>
                                            <span className="text-[10px] text-white font-mono">{notification.quotaBreakdown.details}</span>
                                        </div>
                                    )}
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                )}
            </div>

            <div className="flex-shrink-0">
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
