import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Share2, MoreHorizontal, User } from 'lucide-react';
import { formatViewCount } from '../../core/utils/formatUtils';
import type { VideoDetails } from '../../core/utils/youtubeApi';
import { useChannelStore } from '../../core/stores/channelStore';
import { Toast } from '../../components/Shared/Toast';

interface WatchPageVideoInfoProps {
    video: VideoDetails;
}

export const WatchPageVideoInfo: React.FC<WatchPageVideoInfoProps> = ({ video }) => {
    const { currentChannel } = useChannelStore();
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);

    const description = video?.description || '';

    return (
        <>
            <h1 className="text-xl font-bold text-text-primary mb-3 line-clamp-2">
                {video.title}
            </h1>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-bg-secondary flex-shrink-0">
                        {(video.isCustom && currentChannel?.avatar) ? (
                            <img src={currentChannel.avatar} alt={video.channelTitle} className="w-full h-full object-cover" />
                        ) : video.channelAvatar ? (
                            <img src={video.channelAvatar} alt={video.channelTitle} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-bg-secondary flex items-center justify-center">
                                <User size={20} className="text-text-secondary" />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-text-primary text-base">
                            {(video.isCustom && currentChannel) ? (
                                currentChannel.name
                            ) : video.channelId ? (
                                <a
                                    href={`https://www.youtube.com/channel/${video.channelId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-inherit no-underline hover:text-blue-500 transition-colors"
                                >
                                    {video.channelTitle}
                                </a>
                            ) : (
                                video.channelTitle
                            )}
                        </span>
                        <span className="text-xs text-text-secondary">
                            {video.subscriberCount || '1.2M'} subscribers
                        </span>
                    </div>
                    <button className="bg-text-primary text-bg-primary px-4 py-2 rounded-full font-medium text-sm ml-6 hover:opacity-90 transition-opacity cursor-pointer border-none">
                        Subscribe
                    </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    <div className="flex items-center bg-bg-secondary rounded-full overflow-hidden h-9">
                        <button className="flex items-center gap-1.5 px-4 h-full hover:bg-hover-bg cursor-pointer border-none bg-transparent text-text-primary border-r border-border/50">
                            <ThumbsUp size={18} />
                            <span className="text-sm font-medium">{formatViewCount(video.likeCount || '0')}</span>
                        </button>
                        <button className="flex items-center px-4 h-full hover:bg-hover-bg cursor-pointer border-none bg-transparent text-text-primary">
                            <ThumbsDown size={18} />
                        </button>
                    </div>
                    <button className="flex items-center gap-1.5 px-4 h-9 bg-bg-secondary rounded-full hover:bg-hover-bg cursor-pointer border-none text-text-primary whitespace-nowrap text-sm font-medium">
                        <Share2 size={18} />
                        Share
                    </button>
                    <button className="flex items-center justify-center w-9 h-9 bg-bg-secondary rounded-full hover:bg-hover-bg cursor-pointer border-none text-text-primary flex-shrink-0">
                        <MoreHorizontal size={20} />
                    </button>
                </div>
            </div>

            <div
                className="bg-bg-secondary rounded-xl p-3 text-sm text-text-primary cursor-pointer hover:bg-hover-bg transition-colors mb-2"
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
            >
                <div className="font-bold mb-2">
                    {formatViewCount(video.viewCount)} views • {new Date(video.publishedAt).toLocaleDateString()}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">
                    {isDescriptionExpanded
                        ? description
                        : description.slice(0, 150) + (description.length > 150 ? '...' : '')}
                </div>
                <button className="bg-transparent border-none text-text-primary font-bold mt-1 cursor-pointer p-0">
                    {isDescriptionExpanded ? 'Show less' : '...more'}
                </button>
            </div>

            {video.tags && video.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6 px-1">
                    {video.tags.map((tag, index) => (
                        <button
                            key={index}
                            onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(tag);
                                setToastMessage(`Tag #${tag.replace(/\s+/g, '')} copied to clipboard`);
                                setShowToast(true);
                            }}
                            className="text-blue-500 text-xs font-medium cursor-pointer hover:underline bg-transparent border-none p-0"
                            title="Click to copy"
                        >
                            #{tag.replace(/\s+/g, '')}
                        </button>
                    ))}
                </div>
            )}
            <Toast
                message={toastMessage}
                isVisible={showToast}
                onClose={() => setShowToast(false)}
            />
        </>
    );
};
