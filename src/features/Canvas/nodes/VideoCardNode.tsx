// =============================================================================
// CANVAS: VideoCardNode — container component for full-LOD video cards.
// Subscribes to stores for interactivity (color picker, navigation, player).
// Delegates all rendering to VideoCardUI (shared presentational component).
// =============================================================================

import React, { useCallback, useState } from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import type { VideoCardContext } from '../../../core/types/appContext';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { formatDuration } from '../../../core/utils/formatUtils';
import { ColorPickerPopover } from '../../../components/ui/molecules/ColorPickerPopover';
import { useVideoPlayer } from '../../../core/hooks/useVideoPlayer';
import { VideoCardUI } from './VideoCardUI';

const NODE_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
    '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
    '#A855F7', '#D946EF', '#EC4899', '#64748B', '#9CA3AF',
];

interface VideoCardNodeProps {
    data: VideoCardContext;
    nodeId: string;
}

const VideoCardNodeInner: React.FC<VideoCardNodeProps> = ({ data, nodeId }) => {
    const { currentChannel } = useChannelStore();
    const updateNodeData = useCanvasStore((s) => s.updateNodeData);
    const bringToFront = useCanvasStore((s) => s.bringToFront);

    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    const isOwnVideo = data.ownership === 'own-published' || data.ownership === 'own-draft';
    const nodeColor = data.color || '#64748B';

    // Mini player — use publishedVideoId (YouTube ID) instead of videoId (Firestore doc ID)
    const playableId = data.publishedVideoId;
    const { minimize, activeVideoId, isMinimized } = useVideoPlayer();
    const isNowPlaying = isMinimized && !!playableId && activeVideoId === playableId;

    /** Own videos → traffic tab (new tab), competitor → YouTube (new tab) */
    const handleNavigate = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOwnVideo && currentChannel?.id) {
            window.open(`/video/${currentChannel.id}/${data.videoId}/details?tab=traffic`, '_blank');
        } else if (data.publishedVideoId) {
            window.open(`https://www.youtube.com/watch?v=${data.publishedVideoId}`, '_blank');
        }
    };

    const handleColorChange = useCallback((color: string) => {
        updateNodeData(nodeId, { color });
        setIsColorPickerOpen(false);
    }, [nodeId, updateNodeData]);

    /* ── Thumbnail interactive overlays (only at full LOD) ── */
    const thumbnailOverlay = (
        <>
            {/* Navigate button — appears on hover */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                <button
                    style={{ pointerEvents: 'auto' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleNavigate}
                    className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 border-none cursor-pointer transition-colors"
                    title={isOwnVideo ? 'Open traffic tab' : 'Open on YouTube'}
                >
                    <ArrowUpRight size={12} strokeWidth={2.5} />
                </button>
            </div>

            {/* Duration badge */}
            {data.duration && (
                <div className="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-medium text-white">
                    {formatDuration(data.duration)}
                </div>
            )}

            {/* Play button — small centered button, only if video is published */}
            {playableId && !isNowPlaying && (
                <button
                    style={{ pointerEvents: 'auto' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        minimize(playableId, data.title);
                    }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer border-none z-10 hover:scale-110"
                >
                    <Play size={14} className="text-white fill-white ml-[1px]" />
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
        </>
    );

    /* ── Footer extra: color dot picker ── */
    const footerExtra = (
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
    );

    return (
        <VideoCardUI
            data={data}
            thumbnailOverlay={thumbnailOverlay}
            footerExtra={footerExtra}
            isNowPlaying={isNowPlaying}
        />
    );
};

export const VideoCardNode = React.memo(VideoCardNodeInner);
VideoCardNode.displayName = 'VideoCardNode';
