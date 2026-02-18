import React, { useEffect } from 'react';
import { Minus, Plus, Play } from 'lucide-react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useRenderQueueStore } from '../../../../../core/stores/renderQueueStore';
import { useUIStore } from '../../../../../core/stores/uiStore';
import { RESOLUTION_PRESETS, type RenderResolution } from '../../../../../core/types/editing';
import { getEffectiveDuration } from '../../../../../core/types/editing';
import { BITRATE_MAP } from '../services/renderService';
import { getSizeCalibrationRatio } from '../../../../../core/stores/renderQueueStore';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { formatDuration } from '../utils/formatDuration';
import { useChannelStore } from '../../../../../core/stores/channelStore';

const RESOLUTIONS: RenderResolution[] = ['720p', '1080p', '1440p', '4k'];
const MAX_LOOP_COUNT = 30;

/** MP4 size estimate using YouTube-compliant bitrates */
const estimateFileSize = (durationSec: number, resolution: RenderResolution): string => {
    const videoBitrate = BITRATE_MAP[resolution];
    const audioBitrate = 384_000;
    // Animated grain overlay means most frames differ → encoder uses ~85% of ceiling
    const effectiveVideoBitrate = videoBitrate * 0.85;
    const containerOverhead = 1.05; // MP4/WebM muxing overhead
    const naiveBytes = ((effectiveVideoBitrate + audioBitrate) * durationSec) / 8 * containerOverhead;
    // Apply adaptive correction from past renders (1.0 = no correction)
    const totalBytes = naiveBytes * getSizeCalibrationRatio();
    if (totalBytes < 1_000_000) return `${(totalBytes / 1_000).toFixed(0)} KB`;
    if (totalBytes < 1_000_000_000) return `${(totalBytes / 1_000_000).toFixed(0)} MB`;
    return `${(totalBytes / 1_000_000_000).toFixed(1)} GB`;
};

/** Find the highest resolution that fits within the given image dimensions */
function maxAvailableResolution(imgW: number, imgH: number): RenderResolution {
    let best: RenderResolution = '720p';
    for (const res of RESOLUTIONS) {
        const p = RESOLUTION_PRESETS[res];
        if (p.width <= imgW && p.height <= imgH) best = res;
    }
    return best;
}

interface RenderControlsProps {
    videoId: string;
    videoTitle: string;
    defaultImageUrl: string;
}

export const RenderControls: React.FC<RenderControlsProps> = ({ videoId, videoTitle, defaultImageUrl }) => {
    const tracks = useEditingStore((s) => s.tracks);
    const loopCount = useEditingStore((s) => s.loopCount);
    const resolution = useEditingStore((s) => s.resolution);
    const setLoopCount = useEditingStore((s) => s.setLoopCount);
    const setResolution = useEditingStore((s) => s.setResolution);
    const imageUrl = useEditingStore((s) => s.imageUrl);
    const imageWidth = useEditingStore((s) => s.imageWidth);
    const imageHeight = useEditingStore((s) => s.imageHeight);
    const volume = useEditingStore((s) => s.volume);

    const renderStatus = useRenderQueueStore((s) => s.jobs[videoId]?.status);
    const startJob = useRenderQueueStore((s) => s.startJob);
    const currentChannel = useChannelStore((s) => s.currentChannel);

    // Auto-select best available resolution when image dimensions change
    useEffect(() => {
        if (imageWidth == null || imageHeight == null) return;
        const best = maxAvailableResolution(imageWidth, imageHeight);
        setResolution(best);
    }, [imageWidth, imageHeight, setResolution]);

    const totalTrackDuration = tracks.reduce((sum, t) => sum + getEffectiveDuration(t), 0);
    const totalDuration = totalTrackDuration * loopCount;
    const effectiveImageUrl = imageUrl || defaultImageUrl;

    // Check if image meets minimum resolution (720p)
    const minPreset = RESOLUTION_PRESETS['720p'];
    const imageTooSmall = imageWidth != null && imageHeight != null &&
        (minPreset.width > imageWidth || minPreset.height > imageHeight);

    const canRender = tracks.length > 0 && effectiveImageUrl !== '' && !imageTooSmall && !!currentChannel?.id && renderStatus !== 'rendering' && renderStatus !== 'queued';

    const handleRender = () => {
        if (!canRender) return;

        // Block render if any track has a missing audio URL
        const brokenTracks = tracks.filter((t) => !t.audioUrl);
        if (brokenTracks.length > 0) {
            const names = brokenTracks.map((t) => t.title).join(', ');
            useUIStore.getState().showToast(
                `Cannot render: ${brokenTracks.length} track(s) missing audio — ${names}`,
                'error',
            );
            return;
        }

        startJob(videoId, {
            videoTitle,
            imageUrl: effectiveImageUrl,
            channelId: currentChannel!.id,
            tracks: tracks.map((t) => ({ ...t })),
            resolution,
            loopCount,
            volume,
        });
    };

    return (
        <div className="flex items-center gap-4 p-3 rounded-xl bg-card-bg flex-wrap overflow-hidden">
            {/* Loop Counter */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Loop</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setLoopCount(loopCount - 1)}
                        disabled={loopCount <= 1}
                        className="p-1 rounded hover:bg-hover disabled:opacity-30 transition-colors"
                    >
                        <Minus size={14} />
                    </button>
                    <span className="text-sm font-medium text-text-primary w-6 text-center">
                        {loopCount}
                    </span>
                    <button
                        onClick={() => setLoopCount(loopCount + 1)}
                        disabled={loopCount >= MAX_LOOP_COUNT}
                        className="p-1 rounded hover:bg-hover disabled:opacity-30 transition-colors"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Resolution Picker */}
            <div className="flex items-center gap-1.5">
                {RESOLUTIONS.map((res) => {
                    const preset = RESOLUTION_PRESETS[res];
                    const exceedsImage = imageWidth != null && imageHeight != null &&
                        (preset.width > imageWidth || preset.height > imageHeight);
                    const isSelected = resolution === res;

                    const btn = (
                        <button
                            onClick={() => !exceedsImage && setResolution(res)}
                            disabled={exceedsImage}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${exceedsImage
                                ? 'text-neutral-600 cursor-not-allowed'
                                : isSelected
                                    ? 'bg-text-primary text-bg-primary font-semibold'
                                    : 'text-text-secondary hover:bg-hover'
                                }`}
                        >
                            {preset.label.split(' ')[0]}
                        </button>
                    );

                    if (!exceedsImage) return <React.Fragment key={res}>{btn}</React.Fragment>;

                    return (
                        <PortalTooltip
                            key={res}
                            content={`Image too small (${imageWidth}×${imageHeight})`}
                            side="top"
                            align="center"
                            enterDelay={150}
                        >
                            {btn}
                        </PortalTooltip>
                    );
                })}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Duration & Size */}
            <div className="flex flex-col text-xs text-text-tertiary select-none cursor-default">
                <span>~{formatDuration(totalDuration)}</span>
                {totalDuration > 0 && (
                    <span>~{estimateFileSize(totalDuration, resolution)}</span>
                )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Render Button */}
            <PortalTooltip
                content={imageTooSmall ? `Image too small for 720p (${imageWidth}×${imageHeight}, need ${minPreset.width}×${minPreset.height})` : null}
                disabled={!imageTooSmall}
                side="top"
                enterDelay={150}
            >
                <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRender}
                    disabled={!canRender}
                    isLoading={renderStatus === 'rendering'}
                    leftIcon={renderStatus !== 'rendering' ? <Play size={16} fill="currentColor" /> : undefined}
                    className="flex-shrink-0"
                >
                    Render
                </Button>
            </PortalTooltip>
        </div>
    );
};
