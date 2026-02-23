// =============================================================================
// App Context Types — Page-to-Chat Context Awareness
// =============================================================================
//
// Discriminated union of context items that pages can push into the global
// appContextStore. The chat assistant reads these to enrich its prompts.
// =============================================================================

/**
 * Video card context — metadata + thumbnail for a selected video.
 * Used when the user selects videos on the Playlists page.
 */
export interface VideoCardContext {
    type: 'video-card';
    /** Video ownership relative to the user's channel */
    ownership: 'own-draft' | 'own-published' | 'competitor';
    videoId: string;
    /** YouTube video ID for published own-channel videos (used for mini player) */
    publishedVideoId?: string;
    title: string;
    description: string;
    tags: string[];
    thumbnailUrl: string; // YouTube CDN URL (public, fetchable server-side)
    channelTitle?: string; // Channel name (for competitor videos)
    viewCount?: string;
    publishedAt?: string;
    duration?: string;
    /** Canvas-only: accent color for visual grouping */
    color?: string;
}

/**
 * Suggested Traffic context — source video + selected suggested videos.
 * Used when the user selects rows in the Suggested Traffic table.
 * Contains ALL available data: CSV metrics + YouTube API enrichment + Smart Assistant labels.
 */
export interface SuggestedTrafficContext {
    type: 'suggested-traffic';
    /** When this CSV snapshot was uploaded (formatted date string) */
    snapshotDate?: string;
    /** User-defined label for this snapshot, e.g. "Before title change" */
    snapshotLabel?: string;
    /** The user's video that YouTube suggests alongside the selected videos */
    sourceVideo: {
        videoId: string;
        title: string;
        description: string;
        tags: string[];
        thumbnailUrl: string;
        viewCount?: string;
        publishedAt?: string;
        duration?: string;
    };
    /** Selected suggested videos from the traffic table */
    suggestedVideos: SuggestedVideoItem[];
}

/** Single suggested video with all available enriched data */
export interface SuggestedVideoItem {
    videoId: string;
    title: string;
    // --- CSV metrics (always available) ---
    impressions: number;
    ctr: number;
    /** Computed CTR color from rules at creation time */
    ctrColor?: string;
    views: number;
    avgViewDuration: string;   // "HH:MM:SS"
    watchTimeHours: number;
    // --- YouTube API data (available after enrichment) ---
    thumbnailUrl?: string;
    channelTitle?: string;
    publishedAt?: string;
    duration?: string;
    description?: string;
    tags?: string[];
    viewCount?: string;
    likeCount?: string;
    subscriberCount?: string;
    // --- Smart Assistant / manual labels ---
    trafficType?: string;      // 'autoplay' | 'user_click'
    viewerType?: string;       // 'bouncer' | 'trialist' | 'explorer' | 'interested' | 'core' | 'passive'
    niche?: string;            // Niche name (if assigned)
    nicheProperty?: string;    // 'desired' | 'targeted' | etc.
}

/**
 * Suggested traffic source card — one row from the Suggested Traffic table.
 * Flat type: one node per suggested video on the canvas.
 * Distinct from SuggestedTrafficContext (which is grouped for AI chat).
 */
export interface TrafficSourceCardData {
    type: 'traffic-source';
    videoId: string;
    title: string;
    thumbnailUrl?: string;
    channelTitle?: string;
    /** YouTube channel ID for clickable channel link */
    channelId?: string;
    publishedAt?: string;
    // CSV traffic metrics
    impressions: number;
    ctr: number;             // e.g. 4.2 → displayed as "4.2%"
    /** Computed CTR color from rules at creation time */
    ctrColor?: string;
    views: number;           // views originating from this suggested source
    avgViewDuration: string; // "MM:SS"
    watchTimeHours: number;
    // Smart Assistant labels
    trafficType?: string;    // 'autoplay' | 'user_click'
    viewerType?: string;
    niche?: string;
    /** Hex color of the assigned niche (snapshot at creation time) */
    nicheColor?: string;
    // Context: which source video this was suggested alongside
    sourceVideoId?: string;
    sourceVideoTitle?: string;
    /** Whether metrics represent cumulative totals or delta growth since last snapshot */
    viewMode?: 'cumulative' | 'delta';
}

/** Discriminated union — extend with `|` for new context types. */
export type AppContextItem = VideoCardContext | SuggestedTrafficContext | TrafficSourceCardData;
