// =============================================================================
// Knowledge Items Types
//
// Structured analysis results stored by LLM via tool calls.
// Flat Firestore collection: users/{uid}/channels/{chId}/knowledgeItems/{itemId}
// Category registry: users/{uid}/channels/{chId}/knowledgeCategories (single doc)
// =============================================================================

import type { Timestamp } from 'firebase/firestore';
import type { MemoryVideoRef } from '../../../shared/memory';
export type { KnowledgeVersion } from '../../../shared/knowledgeVersion';
import type { KnowledgeVersion } from '../../../shared/knowledgeVersion';

/** Version with Firestore document ID — for frontend consumption */
export interface KnowledgeVersionWithId extends KnowledgeVersion {
    id: string;
}

/**
 * A structured analysis result created by LLM or manually by the user.
 *
 * Firestore path: users/{uid}/channels/{chId}/knowledgeItems/{itemId}
 * Flat collection — video + channel items coexist, distinguished by `scope`.
 */
export interface KnowledgeItem {
    /** Firestore document ID */
    id: string;

    // — Classification —

    /** Category slug from registry (kebab-case) */
    category: string;
    /** Human-readable title, e.g. "Traffic Analysis — March 2026" */
    title: string;

    // — Content —

    /** Full markdown content (NOT compressed) */
    content: string;
    /** 2-3 sentence summary for card view and listKnowledge tool */
    summary: string;

    // — Provenance —

    /** Conversation that produced this item */
    conversationId: string;
    /** Model that created this item, e.g. "claude-sonnet-4-6" */
    model: string;
    /** Tools used during analysis, e.g. ["analyzeTrafficSources", "getMultipleVideoDetails"] */
    toolsUsed: string[];

    // — Scope —

    /** Discriminator: 'video' = about a specific video, 'channel' = about the channel */
    scope: 'video' | 'channel';
    /** OWNER: video this KI is about (absent for channel-level) */
    videoId?: string;
    /** REFERENCES: video IDs mentioned in this KI (passed by LLM) */
    videoRefs?: string[];
    /** RESOLVED: video snapshots extracted from content at save time (code-driven, not LLM) */
    resolvedVideoRefs?: MemoryVideoRef[];

    // — Timestamps —

    /** When the analysis was conducted (backend serverTimestamp) */
    createdAt: Timestamp;
    /** When the user last edited manually */
    updatedAt?: Timestamp;

    // — Lifecycle —

    /** How this KI was created */
    source: 'chat-tool' | 'conclude' | 'manual';
}

/**
 * A single entry in the category registry.
 */
export interface KnowledgeCategoryEntry {
    /** Kebab-case slug, e.g. "traffic-analysis" */
    slug: string;
    /** Human-readable label, e.g. "Traffic Analysis" */
    label: string;
    /** Which scope this category applies to */
    level: 'video' | 'channel' | 'both';
    /** Description for LLM — guides when to use this category */
    description: string;
}

/**
 * Category registry document stored in Firestore as a single doc.
 *
 * Firestore path: users/{uid}/channels/{chId}/knowledgeCategories
 * Map structure enables atomic per-field updates without transactions.
 */
export interface KnowledgeCategoryRegistry {
    categories: Record<string, Omit<KnowledgeCategoryEntry, 'slug'>>;
}

/**
 * Denormalized flags on video/channel documents for zero-cost discovery.
 * LLM sees these flags in the system prompt and can decide whether to fetch KI.
 */
export interface KnowledgeFlags {
    knowledgeItemCount?: number;
    knowledgeCategories?: string[];
    lastAnalyzedAt?: Timestamp;
}

// =============================================================================
// Constants
// =============================================================================

/** Slug must be lowercase kebab-case. Re-exported from shared SSOT. */
export { SLUG_PATTERN } from '../../../shared/knowledge';

/** Firestore document ID for the single category registry doc */
export const KNOWLEDGE_CATEGORIES_DOC_ID = 'registry';

/**
 * Seed categories — initial set created when the registry doesn't exist.
 * Map key = slug, value = { label, level, description }.
 */
export const SEED_CATEGORIES: Record<string, Omit<KnowledgeCategoryEntry, 'slug'>> = {
    // Video-level (5)
    'traffic-analysis': {
        label: 'Traffic Analysis',
        level: 'video',
        description: 'Where traffic comes from, source breakdown, dynamics over time',
    },
    'suggested-pool': {
        label: 'Suggested Pool',
        level: 'video',
        description: 'Which videos appear in suggested, pool transitions, trajectory',
    },
    'packaging-audit': {
        label: 'Packaging Audit',
        level: 'video',
        description: 'CTR effectiveness, title/thumbnail analysis, tag strategy',
    },
    'audience-fit': {
        label: 'Audience Fit',
        level: 'video',
        description: 'Who watches, retention patterns, audience overlap',
    },
    'competitive-position': {
        label: 'Competitive Position',
        level: 'video',
        description: 'How this video compares to competitors in the niche',
    },

    // Channel-level (5)
    'channel-journey': {
        label: 'Channel Journey',
        level: 'channel',
        description: 'Narrative arc of channel evolution over a time period',
    },
    'strategy-period': {
        label: 'Strategy Period',
        level: 'channel',
        description: 'What was tried during a period, outcomes, lessons learned',
    },
    'growth-mechanics': {
        label: 'Growth Mechanics',
        level: 'channel',
        description: 'What drives growth, repeating patterns, flywheel effects',
    },
    'algorithm-hypothesis': {
        label: 'Algorithm Hypothesis',
        level: 'channel',
        description: 'Hypotheses about how the algorithm treats this channel',
    },
    'niche-analysis': {
        label: 'Niche Analysis',
        level: 'channel',
        description: 'Positioning among competitors, market dynamics, opportunities',
    },
};
