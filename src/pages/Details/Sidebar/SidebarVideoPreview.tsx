import React from 'react';
import { Play } from 'lucide-react';
import { type VideoDetails, type PackagingVersion } from '../../../core/utils/youtubeApi';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { useVideoPlayer } from '../../../core/hooks/useVideoPlayer';

interface SidebarVideoPreviewProps {
    video: VideoDetails;
    viewingVersion?: number | 'draft';
    versions?: PackagingVersion[];
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

export const SidebarVideoPreview: React.FC<SidebarVideoPreviewProps> = ({
    video,
    viewingVersion = 'draft',
    versions = []
}) => {
    const { minimize } = useVideoPlayer();

    // Resolve the YouTube video ID:
    // - Custom videos: use publishedVideoId (set when published to YouTube)
    // - Regular YouTube videos: video.id IS the YouTube ID
    const youtubeVideoId = video.isCustom ? video.publishedVideoId : video.id;
    const isPlayable = !!youtubeVideoId;

    // Determine title and thumbnail based on the viewed version
    let title = 'Untitled';
    let thumbnail = '';

    if (viewingVersion === 'draft') {
        // Root video data (Draft state)
        title = (video.abTestTitles && video.abTestTitles.length > 0)
            ? video.abTestTitles[0]
            : (video.title || 'Untitled');
        thumbnail = (video.abTestThumbnails && video.abTestThumbnails.length > 0)
            ? video.abTestThumbnails[0]
            : (video.customImage || video.thumbnail || '');
    } else {
        // Historical version data
        const version = versions.find(v => v.versionNumber === viewingVersion);
        if (version?.configurationSnapshot) {
            const snap = version.configurationSnapshot;
            title = (snap.abTestTitles && snap.abTestTitles.length > 0)
                ? snap.abTestTitles[0]
                : (snap.title || 'Untitled');
            thumbnail = (snap.abTestThumbnails && snap.abTestThumbnails.length > 0)
                ? snap.abTestThumbnails[0]
                : (snap.coverImage || video.thumbnail || '');
        } else {
            // Fallback to root data if version not found
            title = video.title || 'Untitled';
            thumbnail = video.customImage || video.thumbnail || '';
        }
    }

    return (
        <div className="px-[15px] pb-4">
            {/* Thumbnail - full width with rounded corners */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-bg-tertiary group cursor-pointer"
                onClick={() => isPlayable && youtubeVideoId && minimize(youtubeVideoId, title)}
            >
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        alt={title}
                        className="w-full h-full object-cover transition-all duration-200 ease-out group-hover:scale-105 group-hover:brightness-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-secondary">
                        No thumbnail
                    </div>
                )}
                {/* Play button overlay — only for published videos */}
                {isPlayable && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                        <div className="w-10 h-10 rounded-full bg-black/70 flex items-center justify-center shadow-lg transition-transform duration-150 ease-out group-hover:scale-110">
                            <Play size={20} className="text-white fill-white ml-[2px]" />
                        </div>
                    </div>
                )}
                {video.duration && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-xs font-medium rounded z-20">
                        {formatDuration(video.duration)}
                    </span>
                )}
            </div>

            {/* Video Info */}
            <div className="mt-4 px-1">
                <p className="text-sm font-medium text-text-primary">Your video</p>
                <PortalTooltip
                    content={title}
                    enterDelay={300}
                    className="!bg-[#5A5A5A] !max-w-[280px] !whitespace-normal"
                    triggerClassName="block w-full"
                >
                    <div
                        title=""
                        className="text-sm mt-1 cursor-default"
                        style={{
                            color: '#9B9B9B',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            width: '100%'
                        }}
                    >
                        {title}
                    </div>
                </PortalTooltip>
            </div>
        </div>
    );
};
