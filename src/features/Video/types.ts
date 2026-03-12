/**
 * VideoPreviewData — dedicated tooltip type for video previews.
 *
 * Source-agnostic: used by Chat (tool results), Trends (table/timeline),
 * and Traffic (suggested traffic rows). NOT tied to app context union.
 *
 * Only videoId and title are required — tooltip renders "show what you have"
 * based on which optional fields are populated.
 */
export interface VideoPreviewData {
    videoId: string;
    /** YouTube-embeddable ID. Differs from videoId for custom videos (custom-* doc IDs).
     *  Undefined for drafts (not published to YouTube). */
    youtubeVideoId?: string;
    title: string;
    thumbnailUrl?: string;
    channelTitle?: string;
    channelId?: string;
    viewCount?: number;
    publishedAt?: string;
    duration?: string;
    description?: string;
    tags?: string[];
    ownership?: 'own-draft' | 'own-published' | 'competitor';
    delta24h?: number | null;
    delta7d?: number | null;
    delta30d?: number | null;
}

/**
 * Fixed dimensions for VideoPreviewTooltip modes.
 * Co-located with content component (SSOT) — callers import these
 * instead of hardcoding magic numbers.
 */
export const PREVIEW_DIMENSIONS = {
    full: { width: 800, height: 700 },
    mini: { width: 480 },
} as const;
