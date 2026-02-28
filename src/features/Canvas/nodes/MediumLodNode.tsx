// =============================================================================
// CANVAS: MediumLodNode — mid-detail card for intermediate zoom (0.25–0.50).
// Shows thumbnail + title + hover navigate button.
// Pure render — zero store subscriptions for maximum memo efficiency.
// =============================================================================

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { CanvasNode } from '../../../core/types/canvas';
import type { VideoCardContext, TrafficSourceCardData } from '../../../core/types/appContext';
import type { StickyNoteData, ImageNodeData } from '../../../core/types/canvas';
import { VideoCardUI } from './VideoCardUI';

interface MediumLodNodeProps {
    node: CanvasNode;
    /** Channel ID for own-video navigation (traffic tab) */
    channelId?: string;
    /** Measured full-size height — used as minHeight to prevent LOD shift */
    measuredHeight?: number;
}

/* ── Note‑color map (must match StickyNoteNode) ── */
const NOTE_BG: Record<string, string> = {
    yellow: 'rgba(253, 224, 71, 0.15)',
    green: 'rgba(134, 239, 172, 0.15)',
    blue: 'rgba(147, 197, 253, 0.15)',
    pink: 'rgba(249, 168, 212, 0.15)',
    purple: 'rgba(196, 181, 253, 0.15)',
};

/** Navigate button — opens in new tab. Pure <a>, no hooks. */
const NavButton: React.FC<{ href: string; title: string; position?: 'top-right' | 'bottom-left' }> = ({ href, title, position = 'top-right' }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`absolute ${position === 'bottom-left'
            ? 'bottom-1 left-1 w-14 h-14'
            : 'top-1.5 right-1.5 w-16 h-16'
            } rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 no-underline opacity-0 group-hover/medium:opacity-100 transition-opacity duration-150 z-10`}
        style={{ pointerEvents: 'auto' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        title={title}
    >
        <ArrowUpRight size={position === 'bottom-left' ? 20 : 24} strokeWidth={2.5} />
    </a>
);

/** Build navigate URL based on ownership */
function navUrl(data: VideoCardContext | TrafficSourceCardData, channelId?: string): string | null {
    // VideoCardContext has 'ownership', TrafficSourceCardData does not have own/competitor distinction
    if ('ownership' in data) {
        const vcc = data as VideoCardContext;
        const isOwn = vcc.ownership === 'own-published' || vcc.ownership === 'own-draft';
        if (isOwn && channelId) {
            return `/video/${channelId}/${vcc.videoId}/details?tab=traffic`;
        }
        const ytId = vcc.publishedVideoId || vcc.videoId;
        return ytId ? `https://www.youtube.com/watch?v=${ytId}` : null;
    }
    // TrafficSourceCardData — always YouTube
    return data.videoId ? `https://www.youtube.com/watch?v=${data.videoId}` : null;
}

/** Navigate title based on ownership */
function navTitle(data: VideoCardContext | TrafficSourceCardData): string {
    const isOwn = 'ownership' in data && (data.ownership === 'own-published' || data.ownership === 'own-draft');
    return isOwn ? 'Open traffic tab' : 'Open on YouTube';
}

/* ── Video Card — delegates to shared VideoCardUI ── */
const VideoMedium: React.FC<{ data: VideoCardContext; channelId?: string; measuredHeight?: number }> = ({ data, channelId, measuredHeight }) => {
    const url = navUrl(data, channelId);
    // Medium LOD: simple navigate link as thumbnail overlay, no footer extras
    const thumbnailOverlay = url ? (
        <NavButton href={url} title={navTitle(data)} />
    ) : null;

    return <VideoCardUI data={data} thumbnailOverlay={thumbnailOverlay} minHeight={measuredHeight} />;
};

/* ── Traffic Source Card ── */
const TrafficMedium: React.FC<{ data: TrafficSourceCardData; measuredHeight?: number }> = ({ data, measuredHeight }) => {
    const accent = data.nicheColor || '#6d28d9';
    const url = navUrl(data);
    return (
        <div
            className="group/medium"
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                background: `color-mix(in srgb, var(--bg-secondary) 85%, ${accent} 15%)`,
                border: `1px solid color-mix(in srgb, var(--border) 60%, ${accent} 40%)`,
                borderRadius: 12,
                overflow: 'hidden',
                ...(measuredHeight ? { minHeight: measuredHeight } : {}),
            }}
        >
            {/* Thumbnail */}
            <div style={{ position: 'relative', width: '38%', flexShrink: 0, aspectRatio: '16/9', background: 'var(--bg-secondary)', overflow: 'hidden', borderRadius: 8, margin: 6 }}>
                {data.thumbnailUrl && (
                    <img
                        src={data.thumbnailUrl}
                        alt=""
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                )}
                {url && <NavButton href={url} title="Open on YouTube" position="bottom-left" />}
            </div>
            {/* Title */}
            <div
                style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    alignSelf: 'center',
                    padding: '4px 8px 4px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                }}
            >
                {data.title}
            </div>
        </div>
    );
};

/* ── Sticky Note ── */
const StickyMedium: React.FC<{ data: StickyNoteData }> = ({ data }) => (
    <div
        style={{
            width: '100%',
            height: '100%',
            background: NOTE_BG[data.color] || NOTE_BG.yellow,
            border: '1px solid rgba(148, 163, 184, 0.15)',
            borderRadius: 4,
            padding: '8px 10px',
            fontSize: 10,
            fontWeight: 500,
            lineHeight: 1.3,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
        }}
    >
        {data.content}
    </div>
);

/* ── Image ── */
const ImageMedium: React.FC<{ data: ImageNodeData }> = ({ data }) => (
    <div
        style={{
            width: '100%',
            height: '100%',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--bg-secondary)',
        }}
    >
        {data.downloadUrl ? (
            <img
                src={data.downloadUrl}
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
        ) : (
            <span className="shimmer-overlay" style={{ borderRadius: 8 }} />
        )}
    </div>
);

/* ── Main component ── */
const MediumLodNode: React.FC<MediumLodNodeProps> = ({ node, channelId, measuredHeight }) => {
    if (node.type === 'video-card') return <VideoMedium data={node.data as VideoCardContext} channelId={channelId} measuredHeight={measuredHeight} />;
    if (node.type === 'traffic-source') return <TrafficMedium data={node.data as TrafficSourceCardData} measuredHeight={measuredHeight} />;
    if (node.type === 'sticky-note') return <StickyMedium data={node.data as StickyNoteData} />;
    if (node.type === 'image') return <ImageMedium data={node.data as ImageNodeData} />;
    return null;
};

export default React.memo(MediumLodNode);
