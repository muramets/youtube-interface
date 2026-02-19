import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Play, Plus } from 'lucide-react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';
import { useEditingStore } from '../../../../../core/stores/editing/editingStore';
import { useRenderQueueStore } from '../../../../../core/stores/editing/renderQueueStore';
import { useUIStore } from '../../../../../core/stores/uiStore';
import { RESOLUTION_PRESETS, getEffectiveDuration, type RenderResolution } from '../../../../../core/types/editing';
import { BITRATE_MAP } from '../services/renderService';
import { getSizeCalibrationRatio } from '../../../../../core/stores/editing/renderQueueStore';
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

// ── Resolution Dropdown ──────────────────────────────────────────────────────

interface ResolutionDropdownProps {
    resolution: RenderResolution;
    imageWidth: number | null | undefined;
    imageHeight: number | null | undefined;
    onSelect: (res: RenderResolution) => void;
}

const ResolutionDropdown: React.FC<ResolutionDropdownProps> = ({ resolution, imageWidth, imageHeight, onSelect }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const preset = RESOLUTION_PRESETS[resolution];

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold
                           bg-text-primary text-bg-primary hover:opacity-90 transition-opacity"
            >
                {preset.label.split(' ')[0]}
                <ChevronDown
                    size={11}
                    className="transition-transform duration-150"
                    style={{ transform: open ? 'rotate(180deg)' : undefined }}
                />
            </button>

            {open && (
                <div
                    className="absolute bottom-full mb-1 left-0 z-50
                               bg-bg-secondary border border-border rounded-lg shadow-xl
                               py-1 min-w-[90px] animate-fade-in"
                >
                    {RESOLUTIONS.map(res => {
                        const p = RESOLUTION_PRESETS[res];
                        const exceeds = imageWidth != null && imageHeight != null &&
                            (p.width > imageWidth || p.height > imageHeight);
                        const isSelected = resolution === res;

                        const item = (
                            <button
                                key={res}
                                disabled={exceeds}
                                onClick={() => {
                                    if (!exceeds) { onSelect(res); setOpen(false); }
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                                    ${exceeds
                                        ? 'text-text-tertiary cursor-not-allowed opacity-40'
                                        : isSelected
                                            ? 'text-text-primary font-semibold bg-white/[0.06]'
                                            : 'text-text-secondary hover:bg-hover hover:text-text-primary'
                                    }`}
                            >
                                {p.label.split(' ')[0]}
                                {isSelected && <span className="ml-1 text-[9px] text-text-tertiary">✓</span>}
                            </button>
                        );

                        if (exceeds) {
                            return (
                                <PortalTooltip
                                    key={res}
                                    content={`Image too small (${imageWidth}×${imageHeight})`}
                                    side="right"
                                    enterDelay={100}
                                >
                                    {item}
                                </PortalTooltip>
                            );
                        }
                        return item;
                    })}
                </div>
            )}
        </div>
    );
};

// ── Inline resolution buttons (shown when enough space) ────────────────────

interface InlineResolutionPickerProps {
    resolution: RenderResolution;
    imageWidth: number | null | undefined;
    imageHeight: number | null | undefined;
    onSelect: (res: RenderResolution) => void;
}

const InlineResolutionPicker: React.FC<InlineResolutionPickerProps> = ({ resolution, imageWidth, imageHeight, onSelect }) => (
    <div className="flex items-center gap-1.5">
        {RESOLUTIONS.map((res) => {
            const preset = RESOLUTION_PRESETS[res];
            const exceedsImage = imageWidth != null && imageHeight != null &&
                (preset.width > imageWidth || preset.height > imageHeight);
            const isSelected = resolution === res;

            const btn = (
                <button
                    onClick={() => !exceedsImage && onSelect(res)}
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
);

// ── Compact width threshold ─────────────────────────────────────────────────
// Below this px width the inline buttons won't fit → switch to dropdown.
// Measured empirically: Loop(116) + dividers(2) + inline-resolution(222) + duration(55) + Render(103) + gaps/padding(~100) ≈ 598px
const COMPACT_THRESHOLD = 600;
// Hysteresis buffer — only exit compact mode when width > threshold + buffer.
// Prevents click-flapping at the exact boundary.
const HYSTERESIS = 60;

// Below this px width: hide Loop label and duration block (ultra-narrow, e.g. with browser open)
// Loop(no-label, ~55px) + dropdown(~60px) + Render(~90px) + gaps/padding ≈ 280px
const TINY_THRESHOLD = 380;

// ── Main component ───────────────────────────────────────────────────────────

export const RenderControls: React.FC<RenderControlsProps> = ({ videoId, videoTitle, defaultImageUrl }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isCompact, setIsCompact] = useState(false);
    const [isTiny, setIsTiny] = useState(false);

    // Watch container width — two breakpoints, each with hysteresis
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => {
            const w = entry.contentRect.width;
            setIsCompact(prev => prev ? w < COMPACT_THRESHOLD + HYSTERESIS : w < COMPACT_THRESHOLD);
            setIsTiny(prev => prev ? w < TINY_THRESHOLD + HYSTERESIS : w < TINY_THRESHOLD);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
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

    const handleRender = useCallback(() => {
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
    }, [canRender, tracks, startJob, videoId, videoTitle, effectiveImageUrl, currentChannel, resolution, loopCount, volume]);

    return (
        <div ref={containerRef} className="flex items-center gap-3 p-3 rounded-xl bg-card-bg">
            {/* Loop Counter */}
            <div className="flex items-center gap-2 flex-shrink-0">
                {/* Label hidden in tiny mode to save space */}
                {!isTiny && <span className="text-xs text-text-secondary">Loop</span>}
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
            <div className="w-px h-6 bg-border flex-shrink-0" />

            {/* Resolution — inline buttons or compact dropdown */}
            {isCompact ? (
                <ResolutionDropdown
                    resolution={resolution}
                    imageWidth={imageWidth}
                    imageHeight={imageHeight}
                    onSelect={setResolution}
                />
            ) : (
                <InlineResolutionPicker
                    resolution={resolution}
                    imageWidth={imageWidth}
                    imageHeight={imageHeight}
                    onSelect={setResolution}
                />
            )}

            {/* Duration & Size — hidden in tiny mode */}
            {!isTiny && (
                <>
                    <div className="w-px h-6 bg-border flex-shrink-0" />
                    <div className="flex flex-col text-xs text-text-tertiary select-none cursor-default flex-shrink-0">
                        <span>~{formatDuration(totalDuration)}</span>
                        {totalDuration > 0 && (
                            <span>~{estimateFileSize(totalDuration, resolution)}</span>
                        )}
                    </div>
                </>
            )}

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
