import React from 'react';
import { type VideoDetails } from '../../../utils/youtubeApi';

interface VideoPreviewCardProps {
    video: VideoDetails;
    currentCoverImage?: string;
}

// Parse ISO 8601 duration (PT1H2M3S) to seconds
const parseDuration = (duration?: string): number | null => {
    if (!duration) return null;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    return hours * 3600 + minutes * 60 + seconds;
};

const formatDuration = (durationStr?: string): string => {
    const totalSeconds = parseDuration(durationStr);
    if (totalSeconds === null) return '';

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatViews = (views?: string): string => {
    if (!views) return '0 views';
    const num = parseInt(views, 10);
    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M views`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K views`;
    }
    return `${num} views`;
};

const formatDate = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

export const VideoPreviewCard: React.FC<VideoPreviewCardProps> = ({ video, currentCoverImage }) => {
    // Use current cover image, or customImage for custom videos, otherwise thumbnail
    const thumbnail = currentCoverImage || video.customImage || video.thumbnail;

    return (
        <div
            className="rounded-xl p-4"
            style={{ backgroundColor: '#1F1F1F' }}
        >
            {/* Thumbnail */}
            <div className="relative aspect-video rounded-lg overflow-hidden bg-bg-tertiary">
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">
                        No thumbnail
                    </div>
                )}
                {video.duration && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-xs font-medium rounded">
                        {formatDuration(video.duration)}
                    </span>
                )}
            </div>

            {/* Video Info */}
            <div className="mt-4 space-y-2">
                <h3 className="text-sm font-medium text-text-primary line-clamp-2">
                    {video.title || 'Untitled'}
                </h3>

                <div className="flex flex-col gap-1 text-xs text-text-secondary">
                    {video.viewCount && (
                        <span>{formatViews(video.viewCount)}</span>
                    )}
                    {video.createdAt && (
                        <span>{formatDate(video.createdAt)}</span>
                    )}
                </div>
            </div>
        </div>
    );
};
