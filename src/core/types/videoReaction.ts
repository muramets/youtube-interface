/**
 * Video Reaction — quick-categorization layer for traffic source videos.
 * 
 * BUSINESS RULES:
 * - Stored at CHANNEL level (cross-video: same reaction appears in all suggested traffic tables)
 * - Toggle behavior: clicking the same icon removes the reaction; clicking a different one replaces it
 * - Star color inherits the niche property color (desired/targeted/adjacent/unrelated)
 * - Like = green (positive signal), Dislike = red (negative signal)
 */
export type VideoReaction = 'star' | 'like' | 'dislike';

export interface VideoReactionEdge {
    videoId: string;       // sourceVideoId (also the Firestore document ID)
    reaction: VideoReaction;
    updatedAt: number;
}
