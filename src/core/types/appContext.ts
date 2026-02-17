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
    videoId: string;
    title: string;
    description: string;
    tags: string[];
    thumbnailUrl: string; // YouTube CDN URL (public, fetchable server-side)
    viewCount?: string;
    publishedAt?: string;
    duration?: string;
}

/**
 * Suggested Traffic context — source video + selected suggested videos.
 * Used when the user selects rows in the Suggested Traffic table.
 * Contains ALL available data: CSV metrics + YouTube API enrichment + Smart Assistant labels.
 */
export interface SuggestedTrafficContext {
    type: 'suggested-traffic';
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

/** Discriminated union — extend with `|` for new context types. */
export type AppContextItem = VideoCardContext | SuggestedTrafficContext;
