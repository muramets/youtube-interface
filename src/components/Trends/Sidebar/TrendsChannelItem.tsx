import React from 'react';
import { Eye, EyeOff, MoreVertical } from 'lucide-react';
import type { TrendChannel } from '../../../types/trends';

interface TrendsChannelItemProps {
    channel: TrendChannel;
    isActive: boolean;
    onChannelClick: (id: string) => void;
    onToggleVisibility: (e: React.MouseEvent, id: string, isVisible: boolean) => void;
    onOpenMenu: (e: React.MouseEvent, channelId: string) => void;
}

export const TrendsChannelItem: React.FC<TrendsChannelItemProps> = ({
    channel,
    isActive,
    onChannelClick,
    onToggleVisibility,
    onOpenMenu
}) => {
    return (
        <li
            onClick={() => onChannelClick(channel.id)}
            className={`flex items-center group cursor-pointer p-2 rounded-lg transition-all duration-200 ${isActive
                ? 'bg-white/10'
                : 'hover:bg-white/5'
                }`}
        >
            <img
                src={channel.avatarUrl}
                alt={channel.title}
                referrerPolicy="no-referrer"
                className={`w-6 h-6 rounded-full mr-3 ring-2 transition-all ${!channel.isVisible ? 'grayscale opacity-50' : ''
                    } ${isActive ? 'ring-white/30' : 'ring-transparent'}`}
            />
            <span className={`text-sm truncate flex-1 transition-colors ${isActive ? 'text-text-primary font-medium' : 'text-text-secondary'
                }`}>
                {channel.title}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(e, channel.id, channel.isVisible);
                    }}
                    className={`p-1 rounded-full transition-all ${channel.isVisible
                        ? 'text-text-secondary hover:bg-white/10'
                        : 'text-text-tertiary opacity-100'
                        }`}
                    title={channel.isVisible ? "Hide channel" : "Show channel"}
                >
                    {channel.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenMenu(e, channel.id);
                    }}
                    className="p-1 text-text-secondary hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    title="More options"
                >
                    <MoreVertical size={14} />
                </button>
            </div>
        </li>
    );
};
