// =============================================================================
// getVideoComments handler — Layer 2: Detail
//
// Reads comment threads for any public YouTube video.
// Handler controls pagination loop (Key Decision #9):
//   1 page = 100 comments, 1 quota unit
//   maxPages = 1-3 (LLM parameter)
//
// YouTubeService.getCommentThreads returns 1 page per call.
// Handler loops, aggregates, and reports progress between pages.
// =============================================================================

import { YouTubeService } from "../../../youtube.js";
import type { CommentThreadResult } from "../../../youtube.js";
import type { ToolContext } from "../../types.js";

export async function handleGetVideoComments(
    args: Record<string, unknown>,
    ctx: ToolContext,
): Promise<Record<string, unknown>> {
    // --- Args validation ---
    const videoId = args.videoId as string;
    if (typeof videoId !== "string" || !videoId.trim()) {
        return { error: "videoId (string) is required." };
    }

    const order = (args.order as "relevance" | "time") || "relevance";
    if (order !== "relevance" && order !== "time") {
        return { error: 'order must be "relevance" or "time".' };
    }

    const rawMaxResults = args.maxResults as number | undefined;
    const maxResults = Math.min(Math.max(rawMaxResults ?? 100, 1), 100);

    const rawMaxPages = args.maxPages as number | undefined;
    const maxPages = Math.min(Math.max(rawMaxPages ?? 1, 1), 3);

    // --- YouTube API key check ---
    if (!ctx.youtubeApiKey) {
        return {
            error: "YouTube API key is not configured. The user needs to set their YouTube Data API key in Settings → API Key.",
        };
    }

    const yt = new YouTubeService(ctx.youtubeApiKey);

    // --- Pagination loop ---
    const allComments: CommentThreadResult[] = [];
    let totalQuotaUsed = 0;
    let totalResults = 0;
    let lastNextPageToken: string | undefined;

    try {
        let pageToken: string | undefined;

        for (let page = 1; page <= maxPages; page++) {
            // Report progress
            if (page === 1) {
                ctx.reportProgress?.("Reading comments...");
            } else {
                ctx.reportProgress?.(`Reading more comments (page ${page}/${maxPages})...`);
            }

            const result = await yt.getCommentThreads(videoId, {
                order,
                maxResults,
                pageToken,
            });

            allComments.push(...result.comments);
            totalQuotaUsed += result.quotaUsed;
            totalResults = result.totalResults;
            lastNextPageToken = result.nextPageToken;

            // Stop if no more pages
            if (!result.nextPageToken) break;
            pageToken = result.nextPageToken;
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Graceful handling for comments disabled
        if (msg.toLowerCase().includes("disabled") || msg.includes("403")) {
            return { error: "Comments are disabled for this video." };
        }
        return { error: `Failed to load comments: ${msg}` };
    }

    // --- Build response ---
    const fetchedCount = allComments.length;
    const coveragePercent = totalResults > 0
        ? Math.round((fetchedCount / totalResults) * 100)
        : 0;

    return {
        videoId,
        totalTopLevelThreads: totalResults,
        fetchedCount,
        hasMore: !!lastNextPageToken,
        coveragePercent,
        comments: allComments,
        quotaUsed: totalQuotaUsed,
        _systemNote:
            `You have ${fetchedCount} comments by ${order}. These represent the most engaged ` +
            "discussions. Only request more pages if the user EXPLICITLY asks for broader " +
            "coverage or you cannot find enough signal in the current batch.",
    };
}
