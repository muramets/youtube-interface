// =============================================================================
// CANVAS: MediumLodNode — mid-detail card for intermediate zoom (0.25–0.50).
// Shows thumbnail + title only. No metrics, tooltips, buttons or hooks.
// Pure render — zero store subscriptions for maximum memo efficiency.
// =============================================================================

import React from 'react';
import type { CanvasNode } from '../../core/types/canvas';
import type { VideoCardContext, TrafficSourceCardData } from '../../core/types/appContext';
import type { StickyNoteData } from '../../core/types/canvas';

interface MediumLodNodeProps {
    node: CanvasNode;
}

/* ── Note‑color map (must match StickyNoteNode) ── */
const NOTE_BG: Record<string, string> = {
    yellow: 'rgba(253, 224, 71, 0.15)',
    green: 'rgba(134, 239, 172, 0.15)',
    blue: 'rgba(147, 197, 253, 0.15)',
    pink: 'rgba(249, 168, 212, 0.15)',
    purple: 'rgba(196, 181, 253, 0.15)',
};

/* ── Video Card ── */
const VideoMedium: React.FC<{ data: VideoCardContext }> = ({ data }) => (
    <div
        style={{
            width: '100%',
            background: data.color
                ? `color-mix(in srgb, var(--card-bg) 85%, ${data.color} 15%)`
                : 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
        }}
    >
        {/* Thumbnail 16:9 */}
        <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            {data.thumbnailUrl && (
                <img
                    src={data.thumbnailUrl}
                    alt=""
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
            )}
        </div>
        {/* Title */}
        <div
            style={{
                padding: '6px 8px',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.3,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
            }}
        >
            {data.title}
        </div>
    </div>
);

/* ── Traffic Source Card ── */
const TrafficMedium: React.FC<{ data: TrafficSourceCardData }> = ({ data }) => {
    const accent = data.nicheColor || '#6d28d9';
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                background: `color-mix(in srgb, var(--bg-secondary) 85%, ${accent} 15%)`,
                border: `1px solid color-mix(in srgb, var(--border) 60%, ${accent} 40%)`,
                borderRadius: 12,
                overflow: 'hidden',
            }}
        >
            {/* Thumbnail */}
            <div style={{ width: '38%', flexShrink: 0, aspectRatio: '16/9', background: 'var(--bg-secondary)', overflow: 'hidden', borderRadius: 8, margin: 6 }}>
                {data.thumbnailUrl && (
                    <img
                        src={data.thumbnailUrl}
                        alt=""
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                )}
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

/* ── Main component ── */
const MediumLodNode: React.FC<MediumLodNodeProps> = ({ node }) => {
    if (node.type === 'video-card') return <VideoMedium data={node.data as VideoCardContext} />;
    if (node.type === 'traffic-source') return <TrafficMedium data={node.data as TrafficSourceCardData} />;
    if (node.type === 'sticky-note') return <StickyMedium data={node.data as StickyNoteData} />;
    return null;
};

export default React.memo(MediumLodNode);
