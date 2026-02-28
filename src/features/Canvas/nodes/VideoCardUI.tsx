// =============================================================================
// CANVAS: VideoCardUI — shared presentational component for video cards.
// Used by both VideoCardNode (full LOD) and MediumLodNode (medium LOD).
// Guarantees pixel-identical DOM structure across LOD levels.
//
// Pure render — zero store subscriptions. All interactivity is injected
// via slots (thumbnailOverlay, footerExtra).
// =============================================================================

import React from 'react';
import type { VideoCardContext } from '../../../core/types/appContext';
import { formatViewCount, formatPublishDate } from './videoCardFormatters';

/* ── Props ── */

interface VideoCardUIProps {
    data: VideoCardContext;
    /** Interactive overlays rendered inside the thumbnail area (absolute-positioned).
     *  Full LOD: navigate button, play button, duration badge, now-playing indicator.
     *  Medium LOD: simple navigate link. */
    thumbnailOverlay?: React.ReactNode;
    /** Extra content rendered in the bottom-right of the footer row.
     *  Full LOD: color dot picker.
     *  Medium LOD: omitted (null). */
    footerExtra?: React.ReactNode;
    /** Whether the card is currently playing audio */
    isNowPlaying?: boolean;
    /** Minimum height — used at medium LOD to lock card to full-size measurement */
    minHeight?: number;
}

/* ── Component ── */

const VideoCardUIInner: React.FC<VideoCardUIProps> = ({
    data,
    thumbnailOverlay,
    footerExtra,
    isNowPlaying,
    minHeight,
}) => {
    const views = formatViewCount(data.viewCount);
    const date = formatPublishDate(data.publishedAt);

    return (
        <div
            className="w-full rounded-xl shadow-lg select-none group"
            style={{
                background: data.color
                    ? `color-mix(in srgb, var(--card-bg) 85%, ${data.color} 15%)`
                    : 'var(--card-bg)',
                border: '1px solid var(--border)',
                ...(minHeight ? { minHeight } : {}),
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
                {thumbnailOverlay}
            </div>

            {/* Footer */}
            <div className="px-2.5 py-2 flex flex-col gap-0.5">
                <p className="text-text-primary text-[11px] font-medium line-clamp-2 leading-[1.35]">
                    {data.title}
                </p>
                {data.channelTitle && (
                    <p className="text-text-secondary text-[10px] truncate">{data.channelTitle}</p>
                )}

                {/* Bottom row: meta + optional extra (color dot at full LOD) */}
                <div className="flex items-center justify-between gap-1">
                    {(views || date) ? (
                        <p className="text-text-tertiary text-[10px] leading-none flex items-center gap-1 min-w-0 truncate">
                            {views && <span>{views}</span>}
                            {views && date && <span className="opacity-40">•</span>}
                            {date && <span>{date}</span>}
                        </p>
                    ) : <span />}
                    {footerExtra}
                </div>
            </div>
        </div>
    );
};

export const VideoCardUI = React.memo(VideoCardUIInner);
VideoCardUI.displayName = 'VideoCardUI';
