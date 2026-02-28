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
    description?: string;
    tags?: string[];
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
/**
 * Traffic discrepancy — Long Tail difference.
 * YouTube's reported total vs. sum of visible top sources in the table.
 * `mode` distinguishes cumulative (absolute totals) from delta (change vs previous snapshot).
 */
export interface TrafficDiscrepancy {
    /** Whether these numbers are absolute totals or a delta vs previous snapshot */
    mode: 'cumulative' | 'delta';
    /** YouTube-reported totals from the CSV Total Row */
    reportTotal: { impressions: number; views: number };
    /** Sum of individual sources visible in the table */
    tableSum: { impressions: number; views: number };
    /** Difference: reportTotal − tableSum (hidden minor sources) */
    longTail: { impressions: number; views: number };
}

export interface SuggestedTrafficContext {
    type: 'suggested-traffic';
    /** Snapshot ID for dedup — same source video + different snapshots are kept separately */
    snapshotId?: string;
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
    /** Cumulative Long Tail discrepancy (present when Total Row exists and discrepancy > 0) */
    discrepancy?: TrafficDiscrepancy;
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
    /** Snapshot ID this traffic source was added from (for canvas frame grouping) */
    snapshotId?: string;
    /** Display label for the snapshot (user-defined or auto-generated date) */
    snapshotLabel?: string;
    /** Whether metrics represent cumulative totals or delta growth since last snapshot */
    viewMode?: 'cumulative' | 'delta';
    /** Per-node insights: packaging, visual, music analysis notes */
    insights?: Partial<Record<import('./canvas').InsightCategory, import('./canvas').NodeInsight>>;
    // YouTube API enrichment (carried from cache at creation time — not rendered on canvas)
    description?: string;
    tags?: string[];
    viewCount?: string;
    duration?: string;
}

/**
 * Canvas context nodes — discriminated union by `nodeType`.
 * Each variant has only the fields relevant to that node type.
 */
export interface VideoContextNode {
    nodeType: 'video';
    videoId: string;
    title: string;
    description: string;
    tags: string[];
    thumbnailUrl: string;
    channelTitle?: string;
    viewCount?: string;
    publishedAt?: string;
    duration?: string;
    ownership: 'own-draft' | 'own-published' | 'competitor';
}

export interface TrafficSourceContextNode {
    nodeType: 'traffic-source';
    videoId?: string;
    title: string;
    thumbnailUrl?: string;
    channelTitle?: string;
    impressions?: number;
    ctr?: number;
    views?: number;
    avgViewDuration?: string;
    watchTimeHours?: number;
    trafficType?: string;
    viewerType?: string;
    niche?: string;
    sourceVideoTitle?: string;
    // YouTube API enrichment (resolved at canvas node creation time)
    description?: string;
    tags?: string[];
}

export interface StickyNoteContextNode {
    nodeType: 'sticky-note';
    content: string;
    noteColor: string;
}

export interface ImageContextNode {
    nodeType: 'image';
    imageUrl: string;
    alt?: string;
}

export interface SnapshotFrameContextNode {
    nodeType: 'snapshot-frame';
    /** Snapshot ID this frame represents */
    snapshotId: string;
    /** Display label: user-defined or auto-generated date */
    snapshotLabel: string;
    /** Title of the source video this traffic is suggested alongside */
    sourceVideoTitle: string;
    /** Cumulative Long Tail discrepancy (if Total Row was present in CSV) */
    discrepancy?: TrafficDiscrepancy;
    /** Number of traffic source cards in this frame */
    nodeCount: number;
}

export type CanvasContextNode = VideoContextNode | TrafficSourceContextNode | StickyNoteContextNode | ImageContextNode | SnapshotFrameContextNode;

/**
 * Canvas selection context — all selected nodes grouped as a single context item.
 * The AI receives them as a related group that the user wants to discuss together.
 */
export interface CanvasSelectionContext {
    type: 'canvas-selection';
    /** All selected nodes, grouped for unified AI context */
    nodes: CanvasContextNode[];
}

/** Discriminated union — extend with `|` for new context types. */
export type AppContextItem = VideoCardContext | SuggestedTrafficContext | TrafficSourceCardData | CanvasSelectionContext;

// --- Type-safe filter helpers (DRY: single source for type predicates) ---

export const getVideoCards = (items: AppContextItem[]) =>
    items.filter((c): c is VideoCardContext => c.type === 'video-card');

export const getTrafficContexts = (items: AppContextItem[]) =>
    items.filter((c): c is SuggestedTrafficContext => c.type === 'suggested-traffic');

export const getCanvasContexts = (items: AppContextItem[]) =>
    items.filter((c): c is CanvasSelectionContext => c.type === 'canvas-selection');

// --- Stable identity key (for comparison instead of reference equality) ---

/** Returns a stable string key for any AppContextItem, usable for equality checks. */
export function getContextItemKey(item: AppContextItem): string {
    switch (item.type) {
        case 'video-card':
            return `vc:${item.videoId}`;
        case 'suggested-traffic':
            return `st:${item.sourceVideo.videoId}`;
        case 'traffic-source':
            return `ts:${item.videoId}`;
        case 'canvas-selection':
            // Canvas groups have no stable ID — use sorted node keys as fingerprint
            return `cs:${item.nodes.map(n => n.nodeType === 'video' || n.nodeType === 'traffic-source' ? n.videoId : n.nodeType).join(',')}`;
    }
}
