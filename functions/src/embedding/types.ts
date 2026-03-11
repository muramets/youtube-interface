// =============================================================================
// Embedding Types — shared interfaces and constants for embedding infrastructure
//
// Single source of truth for globalVideoEmbeddings schema, budget tracking,
// sync results, backfill state, and model versioning constants.
// =============================================================================

// --- Model versioning ---

/** Increment when packaging embedding model or input format changes */
export const CURRENT_PACKAGING_MODEL_VERSION = 1;

/** Increment when visual embedding model or input format changes */
export const CURRENT_VISUAL_MODEL_VERSION = 1;

/** Default monthly budget limit in USD */
export const DEFAULT_MONTHLY_BUDGET_LIMIT = 5.0;

/** Log warning when cost reaches this fraction of monthly limit */
export const BUDGET_WARN_THRESHOLD = 0.8;

/** Number of videos per backfill Cloud Task batch */
export const BACKFILL_BATCH_SIZE = 100;

/** Number of videos per scheduled sync Cloud Task batch */
export const SYNC_BATCH_SIZE = 100;

/** Cloud Tasks queue name for all embedding batch operations */
export const EMBEDDING_TASK_QUEUE = "embedding-backfill";

/** Embedding vector dimensions by type */
export const EMBEDDING_DIMENSIONS = {
    /** gemini-embedding-001 with MRL (Matryoshka Representation Learning) */
    packaging: 768,
    /** multimodalembedding@001 native output */
    visual: 1408,
} as const;

// --- Max description length for packaging embedding input ---

/** Truncate description to this length before sending to embedding API */
export const MAX_DESCRIPTION_LENGTH = 3000;

/** Estimated cost per video: packaging (~$0.00004) + thumbnail description (~$0.0001) + visual (~$0.0001) */
export const COST_PER_VIDEO = 0.00024;

// --- Firestore document: globalVideoEmbeddings/{videoId} ---

export interface EmbeddingDoc {
    videoId: string;
    youtubeChannelId: string;
    channelTitle: string;
    title: string;
    tags: string[];
    viewCount: number;
    publishedAt: string;
    thumbnailUrl: string;

    /** 768d packaging embedding (title + tags + description) */
    packagingEmbedding?: number[] | null;
    /** Model version that generated the packaging embedding */
    packagingEmbeddingVersion?: number;

    /** AI-generated description of thumbnail for similarity search */
    thumbnailDescription?: string | null;

    /** 1408d visual embedding from thumbnail image */
    visualEmbedding?: number[] | null;
    /** Model version that generated the visual embedding */
    visualEmbeddingVersion?: number;

    /** Whether thumbnail download failed (video deleted/private on YouTube) */
    thumbnailUnavailable?: boolean;

    /** Consecutive generation failure count (reset to 0 on success) */
    failCount: number;
    /** Last update timestamp (epoch ms) */
    updatedAt: number;
}

// --- Firestore document: system/embeddingBudget ---

export interface EmbeddingBudget {
    /** Current month in YYYY-MM format */
    currentMonth: string;
    /** Accumulated estimated cost this month in USD */
    totalEstimatedCost: number;
    /** Monthly spending limit in USD */
    monthlyLimit: number;
    /** Whether the 80% warning has been triggered this month */
    alertTriggered: boolean;
}

// --- Firestore document: system/embeddingStats ---

export interface EmbeddingStats {
    /** Per-channel embedding coverage counts */
    byChannel: Record<
        string,
        {
            /** Videos with non-null packagingEmbedding */
            packaging: number;
            /** Videos with non-null visualEmbedding */
            visual: number;
            /** Total video docs in channel */
            total: number;
        }
    >;
    /** Last update timestamp (epoch ms) */
    updatedAt: number;
}

// --- Firestore document: system/backfillState ---

export interface BackfillState {
    /** YouTube channel ID → Firestore path + channel title for reading video docs */
    channelPaths: Record<
        string,
        {
            userId: string;
            channelId: string;
            trendChannelId: string;
            channelTitle: string;
        }
    >;
    /** Sorted list of videos to process */
    videos: Array<{
        videoId: string;
        youtubeChannelId: string;
    }>;
    /** Total number of videos in the list */
    totalVideos: number;
    /** Timestamp when backfill state was created (epoch ms) */
    createdAt: number;
}

// --- Firestore document: system/syncState ---

export interface SyncState {
    /** YouTube channel ID → Firestore path + channel title for reading video docs */
    channelPaths: Record<
        string,
        {
            userId: string;
            channelId: string;
            trendChannelId: string;
            channelTitle: string;
        }
    >;
    /** Sorted list of videos to process */
    videos: Array<{
        videoId: string;
        youtubeChannelId: string;
    }>;
    /** Total number of videos in the list */
    totalVideos: number;
    /** Timestamp when sync state was created (epoch ms) */
    createdAt: number;
    /** Running total: embeddings generated across all batches */
    totalGenerated: number;
    /** Running total: failures across all batches */
    totalFailed: number;
    /** Running total: videos skipped due to budget */
    totalSkippedBudget: number;
    /** Running total: estimated cost in USD */
    estimatedCost: number;
    /** Per-channel coverage counters (packaging/visual accumulated by batches, total set by launcher) */
    coverageByChannel: Record<string, { packaging: number; visual: number; total: number }>;
}

// --- Backfill batch result ---

export interface BackfillBatchResult {
    /** Batch number (0-indexed) */
    batch: number;
    /** Embeddings generated in this batch */
    batchGenerated: number;
    /** Failures in this batch */
    batchFailed: number;
    /** Total videos processed so far (across all batches) */
    totalProcessed: number;
    /** Videos remaining after this batch */
    totalRemaining: number;
    /** Estimated cost of this batch in USD */
    estimatedCost: number;
}
