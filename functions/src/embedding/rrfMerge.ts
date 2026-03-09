// =============================================================================
// Reciprocal Rank Fusion (RRF) — Cormack et al. 2009
//
// Merges multiple ranked lists into one using: score(d) = Σ 1/(k + rank_i(d))
// Union semantics: a document appearing in only one list still gets a score.
// Score depends solely on rank position, not on absolute similarity values —
// safe for merging results from different embedding spaces (text vs image).
// =============================================================================

import type { VectorSearchResult } from "./vectorSearch.js";

export interface RRFResult extends VectorSearchResult {
    rrfScore: number;
}

/**
 * Merge multiple ranked lists using Reciprocal Rank Fusion.
 *
 * @param lists - Arrays of VectorSearchResult, each pre-sorted by distance (ascending)
 * @param k - Smoothing constant (default 60, per original paper)
 * @param finalLimit - Max results to return
 */
export function rrfMerge(
    lists: VectorSearchResult[][],
    k = 60,
    finalLimit = 20,
): RRFResult[] {
    const scores = new Map<string, { score: number; data: VectorSearchResult }>();

    for (const list of lists) {
        list.forEach((item, index) => {
            const rank = index + 1; // 1-indexed per original RRF paper
            const rrfScore = 1 / (k + rank);
            const existing = scores.get(item.videoId);
            if (existing) {
                existing.score += rrfScore;
            } else {
                scores.set(item.videoId, { score: rrfScore, data: item });
            }
        });
    }

    return [...scores.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, finalLimit)
        .map(({ score, data }) => ({
            ...data,
            rrfScore: Math.round(score * 100000) / 100000,
        }));
}
