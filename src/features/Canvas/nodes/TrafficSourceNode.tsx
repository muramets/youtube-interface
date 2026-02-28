// =============================================================================
// CANVAS: TrafficSourceNode — horizontal canvas card for suggested traffic rows.
// Visually distinct from VideoCardNode: horizontal layout (thumbnail left, info right),
// purple accent, traffic metrics row, traffic-type badge on thumbnail.
// Width controlled by CanvasNodeWrapper.
// =============================================================================

import React from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import type { TrafficSourceCardData } from '../../../core/types/appContext';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { useVideoPlayer } from '../../../core/hooks/useVideoPlayer';

interface TrafficSourceNodeProps {
    data: TrafficSourceCardData;
}

function formatImpressions(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return `${n}`;
}

function formatViews(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return `${n}`;
}

function trafficBadgeLabel(type?: string): string {
    if (type === 'autoplay') return 'AUTO';
    if (type === 'user_click') return 'CLICK';
    return 'SUGG';
}

function trafficBadgeColor(type?: string): string {
    if (type === 'autoplay') return 'bg-violet-500/80 text-white';
    if (type === 'user_click') return 'bg-teal-500/80 text-white';
    return 'bg-indigo-500/70 text-white';
}

function viewerBadgeLabel(type?: string): string | null {
    switch (type) {
        case 'bouncer': return 'BOUNCER';
        case 'trialist': return 'TRIALIST';
        case 'explorer': return 'EXPLORER';
        case 'interested': return 'INTEREST';
        case 'core': return 'CORE';
        case 'passive': return 'PASSIVE';
        default: return null;
    }
}

function viewerBadgeColor(type?: string): string {
    switch (type) {
        case 'bouncer': return 'bg-red-500/80 text-white';
        case 'trialist': return 'bg-orange-500/80 text-white';
        case 'explorer': return 'bg-amber-500/80 text-white';
        case 'interested': return 'bg-blue-500/80 text-white';
        case 'core': return 'bg-emerald-500/80 text-white';
        case 'passive': return 'bg-purple-500/80 text-white';
        default: return '';
    }
}

function viewerBadgeTooltip(type?: string): string {
    switch (type) {
        case 'bouncer': return 'Bouncer: < 1% Watch Duration';
        case 'trialist': return 'Trialist: 1–10% Watch Duration';
        case 'explorer': return 'Explorer: 10–30% Watch Duration';
        case 'interested': return 'Interested: 30–60% Watch Duration';
        case 'core': return 'Core Audience: 60–95% Watch Duration';
        case 'passive': return 'Passive: > 95% Watch Duration';
        default: return '';
    }
}

const TrafficSourceNodeInner: React.FC<TrafficSourceNodeProps> = ({ data }) => {
    const ctrStr = data.ctr.toFixed(1) + '%';
    const impStr = formatImpressions(data.impressions);
    const viewsStr = formatViews(data.views);
    const badgeLabel = trafficBadgeLabel(data.trafficType);
    const badgeColor = trafficBadgeColor(data.trafficType);
    const vLabel = viewerBadgeLabel(data.viewerType);
    const vColor = viewerBadgeColor(data.viewerType);

    // Niche color → card accent; fallback to indigo
    const accent = data.nicheColor || '#6d28d9';

    // Mini player
    const { minimize, activeVideoId, isMinimized } = useVideoPlayer();
    const isNowPlaying = isMinimized && activeVideoId === data.videoId;

    return (
        <div
            className="w-full rounded-xl select-none pointer-events-none shadow-lg flex items-center overflow-hidden group"
            style={{
                background: `color-mix(in srgb, var(--bg-secondary) 85%, ${accent} 15%)`,
                border: `1px solid color-mix(in srgb, var(--border) 60%, ${accent} 40%)`,
                boxShadow: `0 0 0 1px ${accent}26, 0 4px 16px rgba(0,0,0,0.35)`,
            }}
        >
            {/* Left: Thumbnail */}
            <div className={`relative shrink-0 bg-bg-secondary overflow-hidden rounded-lg m-2 group/thumb pointer-events-auto ${isNowPlaying ? 'ring-1 ring-emerald-400/60' : ''}`} style={{ width: '38%', aspectRatio: '16/9' }}>
                {data.thumbnailUrl ? (
                    <img
                        src={data.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center"
                        style={{ color: 'var(--text-tertiary)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="4" width="20" height="16" rx="3" />
                            <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
                        </svg>
                    </div>
                )}

                {/* Play button overlay — visible on group hover, hidden when playing */}
                {data.videoId && !isNowPlaying && (
                    <button
                        style={{ pointerEvents: 'auto' }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            minimize(data.videoId, data.title);
                        }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg opacity-0 group-hover/thumb:opacity-100 transition-all duration-200 cursor-pointer border-none z-10 hover:scale-110"
                    >
                        <Play size={12} className="text-white fill-white ml-[1px]" />
                    </button>
                )}

                {/* Now Playing indicator */}
                {isNowPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="flex items-end gap-px h-[10px]">
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_infinite]" style={{ height: '5px' }} />
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.2s_infinite]" style={{ height: '9px' }} />
                            <span className="w-[2px] bg-white rounded-full animate-[barBounce_0.8s_ease-in-out_0.4s_infinite]" style={{ height: '6px' }} />
                        </div>
                    </div>
                )}

                {/* Open on YouTube — bottom-left */}
                {data.videoId && (
                    <div className="absolute bottom-1 left-1 pointer-events-auto">
                        <a
                            href={`https://youtu.be/${data.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded-full bg-black/80 flex items-center justify-center text-white hover:scale-125 transition-transform"
                            title="Open on YouTube"
                        >
                            <ArrowUpRight size={10} strokeWidth={2.5} />
                        </a>
                    </div>
                )}

                {/* Traffic-type badge — top-left */}
                <span className={`absolute top-1 left-1 px-1 py-0.5 rounded text-[8px] font-bold tracking-wide ${badgeColor}`}
                    style={{ backdropFilter: 'blur(4px)' }}>
                    {badgeLabel}
                </span>

                {/* Viewer-type badge — top-right */}
                {vLabel && (
                    <div className="absolute top-1 right-1 pointer-events-auto">
                        <PortalTooltip content={viewerBadgeTooltip(data.viewerType)} enterDelay={200} side="top">
                            <span className={`px-1 py-0.5 rounded text-[7px] font-bold tracking-wide cursor-default ${vColor}`}
                                style={{ backdropFilter: 'blur(4px)' }}>
                                {vLabel}
                            </span>
                        </PortalTooltip>
                    </div>
                )}

                {/* AVD badge — bottom-right of thumbnail */}
                {data.avgViewDuration && (
                    <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[9px] font-medium text-white">
                        {data.avgViewDuration}
                    </div>
                )}
            </div>

            {/* Right: Info */}
            <div className="flex-1 min-w-0 px-2.5 py-2 flex flex-col justify-between gap-1">
                {/* Title */}
                <p className="text-[11px] font-medium line-clamp-2 leading-[1.3]"
                    style={{ color: 'var(--text-primary)' }}>
                    {data.title}
                </p>

                {/* Channel + niche */}
                <div className="flex items-center gap-1.5 min-w-0">
                    {data.channelTitle && (
                        <div className="flex items-center gap-0.5 min-w-0 flex-1 group/ch pointer-events-auto">
                            <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                                {data.channelTitle}
                            </p>
                            {data.channelId && (
                                <a
                                    href={`https://www.youtube.com/channel/${data.channelId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 opacity-0 group-hover/ch:opacity-100 transition-all duration-150 text-text-tertiary hover:text-text-primary"
                                    title={`Open ${data.channelTitle} on YouTube`}
                                >
                                    <ArrowUpRight size={10} strokeWidth={2.5} />
                                </a>
                            )}
                        </div>
                    )}
                    {data.niche && (
                        <span className="px-1 py-px rounded text-[8px] font-medium shrink-0"
                            style={{ background: `${accent}40`, color: accent }}>
                            {data.niche}
                        </span>
                    )}
                </div>

                {/* Metrics row */}
                <div className="flex items-center gap-2 flex-wrap">
                    <MetricPill label="Impr" value={impStr} />
                    <span className="text-[8px] opacity-25" style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <MetricPill label="CTR" value={ctrStr} accentColor={data.ctrColor || accent} />
                    <span className="text-[8px] opacity-25" style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <MetricPill label="Views" value={viewsStr} />
                </div>

                {/* Source context */}
                {data.sourceVideoTitle && (
                    <p className="text-[9px] truncate leading-none" style={{ color: 'var(--text-tertiary)' }}>
                        via &ldquo;{data.sourceVideoTitle}&rdquo;
                    </p>
                )}


            </div>
        </div>
    );
};

export const TrafficSourceNode = React.memo(TrafficSourceNodeInner);
TrafficSourceNode.displayName = 'TrafficSourceNode';

const MetricPill: React.FC<{ label: string; value: string; accentColor?: string }> = ({ label, value, accentColor }) => (
    <div className="flex items-center gap-1">
        <span className="text-[8px] font-medium" style={{ color: accentColor || 'var(--text-tertiary)' }}>
            {label}
        </span>
        <span className="text-[10px] font-semibold tabular-nums" style={{ color: accentColor || 'var(--text-primary)' }}>
            {value}
        </span>
    </div>
);
