// =============================================================================
// CANVAS: VideoCardNode — compact canvas card for video context items.
// Thumbnail-dominant layout, width controlled by CanvasNodeWrapper.
// Own videos (own-published, own-draft) get a hover "open details" button.
// Color dot in bottom-right opens a color picker for visual grouping.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, RefreshCw, Play } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { VideoCardContext } from '../../core/types/appContext';
import type { VideoDetails } from '../../core/utils/youtubeApi';
import { useChannelStore } from '../../core/stores/channelStore';
import { useAuth } from '../../core/hooks/useAuth';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { formatDuration } from '../../core/utils/formatUtils';
import { ColorPickerPopover } from '../../components/ui/molecules/ColorPickerPopover';
import { useVideoPlayer } from '../../core/hooks/useVideoPlayer';

const NODE_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
    '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
    '#A855F7', '#D946EF', '#EC4899', '#64748B', '#9CA3AF',
];

interface VideoCardNodeProps {
    data: VideoCardContext;
    nodeId: string;
}

function formatViewCount(raw?: string): string | null {
    if (!raw) return null;
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (isNaN(n) || n === 0) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K views`;
    return `${n} views`;
}

function formatPublishDate(raw?: string): string | null {
    if (!raw) return null;
    const date = new Date(raw);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
}

export const VideoCardNode: React.FC<VideoCardNodeProps> = ({ data, nodeId }) => {
    const views = formatViewCount(data.viewCount);
    const date = formatPublishDate(data.publishedAt);
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const setOpen = useCanvasStore((s) => s.setOpen);
    const updateNodeData = useCanvasStore((s) => s.updateNodeData);
    const bringToFront = useCanvasStore((s) => s.bringToFront);
    const queryClient = useQueryClient();

    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    const isOwnVideo = data.ownership === 'own-published' || data.ownership === 'own-draft';
    const nodeColor = data.color || '#64748B'; // default slate

    // Mini player — use publishedVideoId (YouTube ID) instead of videoId (Firestore doc ID)
    const playableId = data.publishedVideoId;
    const { minimize, activeVideoId, isMinimized } = useVideoPlayer();
    const isNowPlaying = isMinimized && !!playableId && activeVideoId === playableId;

    const handleOpenDetails = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentChannel?.id) return;
        setOpen(false);
        navigate(`/video/${currentChannel.id}/${data.videoId}/details`);
    };

    const handleRefresh = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user?.uid || !currentChannel?.id) return;
        const cached = queryClient.getQueryData<VideoDetails[]>(
            ['videos', user.uid, currentChannel.id]
        );
        const fresh = cached?.find((v) => v.id === data.videoId);
        if (!fresh) return;

        updateNodeData(nodeId, {
            viewCount: fresh.mergedVideoData?.viewCount || fresh.viewCount || data.viewCount,
            publishedAt: fresh.mergedVideoData?.publishedAt || fresh.publishedAt || data.publishedAt,
            duration: fresh.mergedVideoData?.duration || data.duration,
            thumbnailUrl: fresh.customImage || fresh.thumbnail || data.thumbnailUrl,
            title: fresh.title || data.title,
            // Pull published YouTube ID so play button works after refresh
            ...(fresh.publishedVideoId ? { publishedVideoId: fresh.publishedVideoId } : {}),
        });
    }, [user, currentChannel, data, nodeId, queryClient, updateNodeData]);

    const handleColorChange = useCallback((color: string) => {
        updateNodeData(nodeId, { color });
        setIsColorPickerOpen(false);
    }, [nodeId, updateNodeData]);

    return (
        <div
            className="w-full rounded-xl shadow-lg select-none group"
            style={{
                background: data.color
                    ? `color-mix(in srgb, var(--card-bg) 85%, ${data.color} 15%)`
                    : 'var(--card-bg)',
                border: '1px solid var(--border)',
            }}
        >
            {/* Thumbnail — 16:9 */}
            <div className={`relative w-full aspect-video bg-bg-secondary overflow-hidden rounded-t-xl ${isNowPlaying ? 'ring-1 ring-emerald-400/60' : ''}`}>
                {data.thumbnailUrl ? (
                    <img
                        src={data.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-tertiary">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="4" width="20" height="16" rx="3" />
                            <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
                        </svg>
                    </div>
                )}

                {/* Action buttons — appear on hover */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                        style={{ pointerEvents: 'auto' }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={handleRefresh}
                        className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 border-none cursor-pointer transition-colors"
                        title="Refresh data"
                    >
                        <RefreshCw size={11} strokeWidth={2.5} />
                    </button>
                    {isOwnVideo && (
                        <button
                            style={{ pointerEvents: 'auto' }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={handleOpenDetails}
                            className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 border-none cursor-pointer transition-colors"
                            title="Open details"
                        >
                            <ArrowUpRight size={12} strokeWidth={2.5} />
                        </button>
                    )}
                </div>

                {/* Duration badge */}
                {data.duration && (
                    <div className="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium text-white">
                        {formatDuration(data.duration)}
                    </div>
                )}

                {/* Play button overlay — visible on group hover, only if video is published */}
                {playableId && !isNowPlaying && (
                    <button
                        style={{ pointerEvents: 'auto' }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            minimize(playableId, data.title);
                        }}
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer bg-transparent border-none z-10"
                    >
                        <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg transition-transform duration-150 ease-out hover:scale-110">
                            <Play size={14} className="text-white fill-white ml-[1px]" />
                        </div>
                    </button>
                )}

                {/* Now Playing indicator */}
                {isNowPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="flex items-end gap-px h-[12px]">
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_infinite]" style={{ height: '6px' }} />
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.2s_infinite]" style={{ height: '10px' }} />
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.4s_infinite]" style={{ height: '7px' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-2.5 py-2 flex flex-col gap-0.5">
                <p className="text-text-primary text-[11px] font-medium line-clamp-2 leading-[1.35]">
                    {data.title}
                </p>
                {data.channelTitle && (
                    <p className="text-text-secondary text-[10px] truncate">{data.channelTitle}</p>
                )}

                {/* Bottom row: meta + color dot */}
                <div className="flex items-center justify-between gap-1">
                    {(views || date) ? (
                        <p className="text-text-tertiary text-[10px] leading-none flex items-center gap-1 min-w-0 truncate">
                            {views && <span>{views}</span>}
                            {views && date && <span className="opacity-40">•</span>}
                            {date && <span>{date}</span>}
                        </p>
                    ) : <span />}

                    {/* Color dot */}
                    <div className="relative shrink-0" style={{ pointerEvents: 'auto' }}>
                        <button
                            className="w-3.5 h-3.5 rounded-full border border-white/20 cursor-pointer transition-transform hover:scale-125"
                            style={{ backgroundColor: nodeColor, borderStyle: 'solid' }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isColorPickerOpen) bringToFront(nodeId);
                                setIsColorPickerOpen(!isColorPickerOpen);
                            }}
                            title="Change color"
                        />
                        {isColorPickerOpen && (
                            <div className="absolute bottom-6 right-0 z-50">
                                <ColorPickerPopover
                                    currentColor={nodeColor}
                                    colors={NODE_COLORS}
                                    onColorChange={handleColorChange}
                                    onClose={() => setIsColorPickerOpen(false)}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
