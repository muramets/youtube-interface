// =============================================================================
// Export Knowledge Items — Pack selected KI as markdown files in a ZIP archive.
//
// Structure:
//   CLAUDE.md              — Rules for editing KI in Claude Code
//   _reference-map.md      — Video + KI index
//   _ai-settings.md        — Base instructions from app settings
//   memories/               — Conversation memories from app (one file per memory)
//   channel/               — Channel-scoped KI
//   video/                 — Video-scoped KI
// =============================================================================

import JSZip from 'jszip';
import type { KnowledgeItem } from '../../../core/types/knowledge';
import type { VideoPreviewData } from '../../Video/types';
import type { AiAssistantSettings, ConversationMemory } from '../../../core/types/chat/chat';
import { fetchImageBlob } from '../../../core/utils/zipUtils';

/** Rough estimate: ~4 chars per token (matches backend CHARS_PER_TOKEN). */
const CHARS_PER_TOKEN = 4;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface ExportKnowledgeOptions {
    items: KnowledgeItem[];
    videoMap?: Map<string, VideoPreviewData>;
    aiSettings?: AiAssistantSettings;
    memories?: ConversationMemory[];
}

/**
 * Export selected Knowledge Items as a ZIP archive.
 * Downloads automatically via browser blob URL.
 */
export async function exportKnowledgeAsZip(options: ExportKnowledgeOptions): Promise<void> {
    const { items, videoMap, aiSettings, memories } = options;
    const zip = new JSZip();

    // Collect all video refs for the reference map
    const allVideos = collectAllVideos(items, videoMap);

    // Add KI files
    for (const item of items) {
        const folder = item.scope === 'channel' ? 'channel' : 'video';
        const filename = sanitizeFilename(item.title);
        const md = buildKiMarkdown(item);
        zip.file(`${folder}/${filename}.md`, md);
    }

    // Download thumbnails in parallel (best-effort — failures are skipped)
    const thumbnailFolder = zip.folder('thumbnails');
    if (thumbnailFolder) {
        const fetchJobs = Array.from(allVideos.entries())
            .filter(([, v]) => v.thumbnailUrl)
            .map(async ([id, v]) => {
                try {
                    const blob = await fetchImageBlob(v.thumbnailUrl!);
                    thumbnailFolder.file(`${id}.jpg`, blob);
                } catch {
                    // Skip failed thumbnails — non-critical
                }
            });
        await Promise.all(fetchJobs);
    }

    // Add reference map + app context
    zip.file('_reference-map.md', buildReferenceMap(items, allVideos));
    zip.file('_app-context.md', APP_CONTEXT);

    // Add AI settings
    if (aiSettings?.globalSystemPrompt) {
        zip.file('_ai-settings.md', buildAiSettingsFile(aiSettings));
    }

    // Add memories as individual files
    if (memories && memories.length > 0) {
        for (const m of memories) {
            const filename = sanitizeFilename(m.conversationTitle);
            zip.file(`memories/${filename}.md`, buildMemoryMarkdown(m));
        }
    }

    // Add CLAUDE.md
    zip.file('CLAUDE.md', buildClaudeMd(items.length));

    // Generate and download
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `knowledge-export-${new Date().toISOString().slice(0, 10)}.zip`);
}

// -----------------------------------------------------------------------------
// KI Markdown builder
// -----------------------------------------------------------------------------

function buildKiMarkdown(item: KnowledgeItem): string {
    const parts: string[] = [];

    // Summary block
    parts.push('> **Summary:** ' + item.summary);
    parts.push('');

    // Metadata as HTML comment (invisible in preview, useful for Claude)
    const meta = [
        `id: ${item.id}`,
        `category: ${item.category}`,
        `scope: ${item.scope}`,
        item.videoId ? `videoId: ${item.videoId}` : null,
        `model: ${item.model}`,
        `source: ${item.source}`,
        `created: ${formatTimestamp(item.createdAt)}`,
    ].filter(Boolean).join(' | ');
    parts.push(`<!-- ${meta} -->`);
    parts.push('');

    // Main content as-is (preserves vid:// links, tables, etc.)
    parts.push(item.content);

    return parts.join('\n');
}

// -----------------------------------------------------------------------------
// Reference Map
// -----------------------------------------------------------------------------

interface VideoRefEntry {
    /** Primary ID (used as map key). */
    id: string;
    /** YouTube video ID — differs from id for published custom videos. */
    youtubeVideoId?: string;
    title: string;
    channel?: string;
    published?: string;
    views?: string;
    thumbnailUrl?: string;
}

function collectAllVideos(
    items: KnowledgeItem[],
    videoMap?: Map<string, VideoPreviewData>,
): Map<string, VideoRefEntry> {
    const videos = new Map<string, VideoRefEntry>();
    // Alias map: youtubeVideoId → primary entry key (for dedup)
    const aliases = new Map<string, string>();

    // 1. Owner videos from videoMap (richest data — has deltas, channel title)
    for (const item of items) {
        if (item.videoId && videoMap) {
            const v = videoMap.get(item.videoId);
            if (v && !videos.has(item.videoId)) {
                const ytId = v.youtubeVideoId && v.youtubeVideoId !== item.videoId
                    ? v.youtubeVideoId : undefined;
                videos.set(item.videoId, {
                    id: item.videoId,
                    youtubeVideoId: ytId,
                    title: v.title,
                    channel: v.channelTitle,
                    published: formatPublishedDate(v.publishedAt),
                    views: v.viewCount != null ? formatViews(v.viewCount) : undefined,
                    thumbnailUrl: v.thumbnailUrl,
                });
                if (ytId) aliases.set(ytId, item.videoId);
            }
        }
    }

    // 2. Resolved video refs from each KI (server snapshot — competitors + own)
    //    MemoryVideoRef lacks channelTitle — enrich from videoMap when available.
    for (const item of items) {
        if (!item.resolvedVideoRefs) continue;
        for (const ref of item.resolvedVideoRefs) {
            if (videos.has(ref.videoId) || aliases.has(ref.videoId)) continue;
            const enriched = videoMap?.get(ref.videoId);
            videos.set(ref.videoId, {
                id: ref.videoId,
                title: ref.title,
                channel: enriched?.channelTitle,
                published: formatPublishedDate(ref.publishedAt),
                views: ref.viewCount != null ? formatViews(ref.viewCount) : undefined,
                thumbnailUrl: ref.thumbnailUrl ?? enriched?.thumbnailUrl,
            });
        }
    }

    // 3. Fill gaps from videoMap for any vid:// IDs in content
    if (videoMap) {
        for (const item of items) {
            const vidLinks = Array.from(item.content.matchAll(/vid:\/\/([A-Za-z0-9_-]+)/g), m => m[1]);
            for (const id of vidLinks) {
                // Skip if already present or is an alias of a custom video
                if (videos.has(id) || aliases.has(id)) continue;
                const v = videoMap.get(id);
                if (v) {
                    const ytId = v.youtubeVideoId && v.youtubeVideoId !== id
                        ? v.youtubeVideoId : undefined;
                    videos.set(id, {
                        id,
                        youtubeVideoId: ytId,
                        title: v.title,
                        channel: v.channelTitle,
                        published: formatPublishedDate(v.publishedAt),
                        views: v.viewCount != null ? formatViews(v.viewCount) : undefined,
                        thumbnailUrl: v.thumbnailUrl,
                    });
                    if (ytId) aliases.set(ytId, id);
                }
            }
        }
    }

    return videos;
}

function buildReferenceMap(items: KnowledgeItem[], videos: Map<string, VideoRefEntry>): string {
    const parts: string[] = ['# Reference Map', ''];

    // Videos table
    if (videos.size > 0) {
        parts.push('## Videos');
        parts.push('');
        parts.push('| IDs | Title | Channel | Published | Views | Thumbnail |');
        parts.push('|-----|-------|---------|-----------|-------|-----------|');
        for (const v of videos.values()) {
            const ids = v.youtubeVideoId ? `${v.id}, ${v.youtubeVideoId}` : v.id;
            const thumb = v.thumbnailUrl ? `[view](thumbnails/${v.id}.jpg)` : '—';
            parts.push(`| ${ids} | ${escPipe(v.title)} | ${v.channel ? escPipe(v.channel) : '—'} | ${v.published ?? '—'} | ${v.views ?? '—'} | ${thumb} |`);
        }
        parts.push('');
    }

    // KI index table
    parts.push('## Knowledge Items');
    parts.push('');
    parts.push('| File | Category | Scope | Video | Tokens |');
    parts.push('|------|----------|-------|-------|--------|');
    for (const item of items) {
        const folder = item.scope === 'channel' ? 'channel' : 'video';
        const filename = sanitizeFilename(item.title);
        const videoTitle = item.videoId ? (videos.get(item.videoId)?.title ?? item.videoId) : '—';
        const tokens = Math.ceil(item.content.length / CHARS_PER_TOKEN);
        parts.push(`| ${folder}/${filename}.md | ${item.category} | ${item.scope} | ${escPipe(videoTitle)} | ~${formatTokens(tokens)} |`);
    }

    return parts.join('\n');
}

// -----------------------------------------------------------------------------
// AI Settings & Memories
// -----------------------------------------------------------------------------

function buildAiSettingsFile(settings: AiAssistantSettings): string {
    const parts: string[] = ['# AI Settings (Base Instructions)', ''];
    parts.push('These are the base instructions configured in the app. They define the AI assistant\'s behavior and personality.');
    parts.push('');
    parts.push('---');
    parts.push('');
    parts.push(settings.globalSystemPrompt);
    if (settings.responseLanguage && settings.responseLanguage !== 'auto') {
        parts.push('');
        parts.push(`**Response Language:** ${settings.responseLanguage}`);
    }
    if (settings.responseStyle) {
        parts.push(`**Response Style:** ${settings.responseStyle}`);
    }
    return parts.join('\n');
}

function buildMemoryMarkdown(m: ConversationMemory): string {
    const parts: string[] = [];
    const date = m.createdAt?.toDate?.()
        ? m.createdAt.toDate().toISOString().slice(0, 10)
        : 'unknown';

    // Metadata comment (same pattern as KI files)
    const meta = [
        `id: ${m.id}`,
        m.conversationId ? `conversationId: ${m.conversationId}` : null,
        `source: ${m.source ?? 'chat'}`,
        m.protected ? 'protected: true' : null,
        `created: ${date}`,
    ].filter(Boolean).join(' | ');
    parts.push(`<!-- ${meta} -->`);
    parts.push('');

    if (m.videoRefs && m.videoRefs.length > 0) {
        const refs = m.videoRefs.map(v =>
            `"${v.title}" [id: ${v.videoId}] (${v.ownership})`
        ).join(', ');
        parts.push(`**Videos:** ${refs}`);
        parts.push('');
    }

    parts.push(m.content);

    return parts.join('\n');
}

// -----------------------------------------------------------------------------
// App Context — tool definitions, agentic rules, verification workflows
// -----------------------------------------------------------------------------

const APP_CONTEXT = `# App Context

This file describes the YouTube creator management app that generated these Knowledge Items.
Understanding the app's tools and data flow helps you audit KI content and suggest verification steps.

## What Is This App

A SaaS for YouTube creators: video editing, packaging, trends analysis, AI chat, playlist management.
The AI chat has access to tools that analyze video performance, traffic sources, suggested traffic pools,
competitor channels, and visual thumbnails. Knowledge Items are the structured output of these analyses.

## Tool Definitions

These are the exact tools available to the AI in the app. Each KI was produced by one or more of these tools.

### Research Tools (Data Collection)

**mentionVideo(videoId)**
Register a video for interactive display in chat — enables thumbnail preview on hover and click navigation.

**getMultipleVideoDetails(videoIds?, titles?)**
Fetch full metadata (description, tags, publishedAt, etc.) for up to 20 videos. Includes thumbnailDescription — an AI-generated visual summary (~200 words). Response includes view growth deltas (viewDelta24h/7d/30d) — ROLLING WINDOWS from today backward, not from publishedAt. If you only know a title, pass it in 'titles' — the system searches Firestore (0 API cost).

**viewThumbnails(videoIds?, titles?)**
View actual video thumbnails as images. Works for BOTH own AND competitor videos. Up to 50 videos per call.

**getVideoComments(videoId, order?, maxResults?, maxPages?)**
Read comments from any public YouTube video. Returns top-level comment threads with author, text, like count, reply count, and inline replies. Default: 100 comments sorted by relevance.

### Traffic Analysis Tools

**analyzeTrafficSources(videoId)**
Analyze WHERE a video's traffic comes from (Browse, Suggested, Search, External, etc.). Returns per-source breakdown with timeline and pre-computed deltas across snapshots. Only works for videos with Traffic Source CSV snapshots uploaded by the user.

**analyzeSuggestedTraffic(videoId, depth?, minImpressions?, minViews?, includeContentAnalysis?)**
Deep analysis of suggested traffic: downloads all CSV snapshots, builds per-video timeline trajectories, identifies pool transitions (new/dropped sources per period), tag/keyword overlap. Each suggested video includes YouTube-wide view deltas. Depth: quick=top 20, standard=top 50, detailed=top 100, deep=all.

### Channel & Competitor Tools

**getChannelOverview(channelId)**
Look up a YouTube channel by URL, @handle, or channel ID. Returns channel metadata and uploadsPlaylistId.

**browseChannelVideos(uploadsPlaylistId, channelId?, publishedAfter?)**
Fetch video list from a channel's uploads. Requires uploadsPlaylistId from getChannelOverview. Returns compact chronological list. Costs YouTube API quota.

**listTrendChannels()**
List all competitor channels tracked in Trends. Returns metadata, video counts, average views, and performance distribution (p25/median/p75/max). Zero API cost.

**browseTrendVideos(channelIds?, dateRange?, performanceTier?, sort?, limit?)**
Browse competitor videos from Trends data. Supports filtering by channels, date range, performance tier. Each video includes view growth deltas. Default limit 50, max 200. Zero API cost.

**getNicheSnapshot(date?, videoId?, channelId?, windowDays?)**
Snapshot of competitor activity around a specific date. Shows what all tracked channels published in ±7 days window with per-channel stats. Zero API cost.

### Semantic Search Tools

**findSimilarVideos(videoId, mode?, limit?)**
Find competitor videos similar to a given video. Modes: 'packaging' (topic similarity), 'visual' (thumbnail similarity), 'both' (combined with Reciprocal Rank Fusion).

**searchDatabase(query, channelIds?, limit?)**
Free-text semantic search across competitor video database. Returns ranked results with view deltas and performance tiers.

### Knowledge Management Tools

**saveKnowledge(category, title, content, summary, videoId?, videoRefs?, toolsUsed?)**
Save structured analysis as a Knowledge Item. Content: 1000-5000 words markdown. For video-scoped KI, MUST include 'Thumbnail & Visual Identity' section. Every video → [title](vid://VIDEO_ID).

**editKnowledge(kiId, content?, operations?, title?, summary?, videoId?, category?)**
Update existing KI. Two modes: surgical edits via operations (preferred, saves ~90% tokens) or full rewrite via content. Content changes are versioned.

**listKnowledge(videoId?, scope?, category?)**
List existing KI — returns summaries only (~500 tokens). Use to check what analysis exists.

**getKnowledge(ids?, videoId?, categories?)**
Retrieve full content of specific KI (~3-5K tokens per item).

### Memory Tools

**saveMemory(content)**
Save cross-conversation memory — concise summary for future sessions. Include: key decisions, action items, open questions.

**editMemory(memoryId, operations[])**
Patch an existing memory from a previous conversation with surgical edits.

## Agentic Behavior Rules

These rules govern how the AI in the app behaves. Understanding them helps you assess KI quality:

- **Check context first.** Before calling any tool, AI checks if data is already in attached context.
- **Batch when possible.** Multiple independent tools called in same turn.
- **Traffic cascade.** analyzeTrafficSources first → if Suggested dominates → analyzeSuggestedTraffic.
- **Visual context.** thumbnailDescription for style patterns; viewThumbnails for detailed recommendations.
- **Deep Analysis → Save KI First.** When 2+ analytical tools used, AI saves KI first, then writes brief summary in chat.
- **Video-scoped KI** must include Thumbnail & Visual Identity section.
- **Every number** must come from tool results, never estimated.
- **Every video mentioned** must have [title](vid://ID) link.

## Verification Workflows

When you find inconsistencies in KI, suggest these steps to the user:

| Issue | Verification |
|-------|-------------|
| Outdated view counts | "Run \`getMultipleVideoDetails\` in the app for fresh data" |
| Inconsistent traffic numbers | "Run \`analyzeTrafficSources\` for the latest CSV snapshot breakdown" |
| Missing suggested pool context | "Run \`analyzeSuggestedTraffic\` with depth=detailed for full pool data" |
| Competitor data seems stale | "Check \`listTrendChannels\` — last sync date shows data freshness" |
| Thumbnail description doesn't match | "View the thumbnail in \`thumbnails/\` folder, or run \`viewThumbnails\` in app" |
| Cross-reference to unknown video | "Run \`getMultipleVideoDetails\` with the title to resolve the video ID" |
| Missing KI for a video | "Run traffic analysis in the app chat — AI will auto-create KI" |

## Data Freshness

- **View counts in KI** are snapshots from when the KI was created. They WILL be outdated.
- **View deltas** (24h/7d/30d) are rolling windows — only accurate on the date computed.
- **Suggested traffic pools** evolve over time — the snapshots show a point-in-time state.
- **Competitor data** depends on Trends sync schedule — may lag by 1-7 days.

When editing KI, preserve original numbers as historical record. If current numbers are needed, suggest the user verify in the app.
`;

// -----------------------------------------------------------------------------
// CLAUDE.md
// -----------------------------------------------------------------------------

function buildClaudeMd(itemCount: number): string {
    return `# CLAUDE.md — KI Editor

You are editing ${itemCount} Knowledge Items (KI) exported from a YouTube creator management app.
Your task: audit cross-references, fix inconsistencies, improve structure.

## File Structure

\`\`\`
CLAUDE.md              — This file (rules)
_reference-map.md      — Video + KI index (source of truth for IDs and metadata)
_app-context.md        — App description, tool definitions, verification workflows
_ai-settings.md        — Base instructions from the app (context for AI personality)
memories/              — Conversation memories (one file per memory, editable)
thumbnails/            — Video thumbnails (JPG, named by video ID)
channel/               — Channel-scoped KI (strategy, growth, journey)
video/                 — Video-scoped KI (traffic analysis, packaging audit)
\`\`\`

## Reading Order

Before touching any KI file, read context files in this exact order:

1. **\`_reference-map.md\`** — Learn all video IDs, titles, dates. This is your lookup table.
2. **\`_app-context.md\`** — Understand the app's tools and how data was generated.
3. **\`_ai-settings.md\`** — Base instructions that shaped the AI's analysis style.
4. **\`memories/\`** — Accumulated channel knowledge from past sessions (one file per memory).
5. **\`thumbnails/\`** — Scan visuals to build intuition for the channel's aesthetic.
6. **\`channel/\`** then **\`video/\`** — Read KI files. Channel-level first (strategy context), then video-level (specific analyses).

## Video Reference Format

EVERY video mentioned by name MUST use \`[title](vid://VIDEO_ID)\` format — in prose, tables, lists, comparisons. No exceptions.

- \`vid://\` links use the video ID as it appears in the KI — usually a YouTube ID (e.g. \`vid://lEOMGToqqBM\`) or occasionally an internal ID (e.g. \`vid://custom-177849302\`)
- Consult \`_reference-map.md\` to resolve IDs ↔ titles ↔ dates
- **Never invent video IDs.** If a video is mentioned by date or description but has no \`vid://\` link, look up its ID in \`_reference-map.md\` and add the link
- When a video is referenced by date only (e.g. "Oct 20 video"), replace with \`[title](vid://ID)\` using the reference map
- **Use the same ID format** that already exists in the KI. If a video uses YouTube ID — keep YouTube ID. Don't convert between formats.

## KI Cross-Reference Format

References between Knowledge Items use \`[KI Title](ki://KI_ID)\` format.

- KI IDs are in the HTML comment metadata at the top of each file (\`<!-- id: ... -->\`)
- Use these links when one KI references analysis from another KI

## Content Rules

These rules match the app's AI behavior — follow them to keep KI compatible:

1. **Content volume:** 1000-5000 words per KI. Comprehensive, reusable analysis records.
2. **Summary:** The blockquote at the top (\`> **Summary:**\`) is a 2-3 sentence summary for card display. Keep it concise.
3. **Metadata comment:** The \`<!-- ... -->\` line contains Firestore metadata. Do NOT modify IDs, category, scope, or videoId — only content and summary are editable.
4. **Video-scoped KI:** Must include a "Thumbnail & Visual Identity" section — describes visual style, composition, color palette, and connects visuals to performance.
5. **Be specific, not generic.** Never say "improve your thumbnail" without explaining how. Reference actual data: colors, text, CTR numbers, comparisons.
6. **Tables:** Preserve existing table formatting. Markdown tables with \`|\` separators.
7. **Structure:** Use markdown headings (##, ###) for sections. These render as collapsible sections in the app.

## Cross-Reference Audit Checklist

When reviewing KI files:

- [ ] Every video mentioned by name has a \`vid://\` link
- [ ] Video names and dates match \`_reference-map.md\`
- [ ] Numbers (views, CTR, impressions) are consistent across KI that reference the same video
- [ ] Cross-KI references (where one analysis mentions findings from another) use \`ki://\` links
- [ ] No "Oct 20 video" or "the video from last week" without a proper \`vid://\` link
- [ ] Summaries accurately reflect the content

## Thumbnails

The \`thumbnails/\` folder contains video thumbnails (JPG) named by video ID. Use these for visual context when auditing "Thumbnail & Visual Identity" sections. Reference map links to them in the Thumbnail column.

## App Context

Read \`_app-context.md\` — it contains the full tool definitions from the app, agentic behavior rules, and verification workflows. Use it to:
- Understand which tool generated specific data in a KI
- Suggest verification steps when you find inconsistencies
- Know what data the user can re-fetch in the app

## AI Settings & Memories

Read \`_ai-settings.md\` and \`memories/\` before editing — they contain:
- The channel's AI personality and instructions
- Accumulated knowledge from previous analysis sessions
- Context about the channel's strategy, niche, and history

Use this context when improving KI content. Memories are the "institutional knowledge" that informed the original analysis.

### Editing Memories

Memories in \`memories/\` are **editable** — same as KI files. After editing KI, update related memories so they reflect the corrected state:
- Add \`ki://\` links to relevant KI files (the user will paste updated memories back into the app)
- Fix outdated facts, numbers, or video references that you corrected in KI
- Add cross-references between memories and KI where analysis overlaps
- Metadata comment (\`<!-- id: ... -->\`) — do NOT change the \`id\` field. Content is freely editable.
- \`vid://\` links in memories follow the same rules as in KI files

The user will paste corrected memory content into the app's Settings → AI Memory section.

## Workflow

1. **Read all context files** in the reading order above. Build a mental map of the channel.
2. **Read all KI files** (channel/ first, then video/). Note inconsistencies as you go.
3. **Present an inconsistency report** in chat — list all issues found (wrong numbers, missing vid:// links, cross-KI contradictions, stale references). Do NOT start editing yet.
4. **User reviews the report** and confirms which issues to fix and in what direction.
5. **Fix issues** file by file. After fixing a KI, update any related memories in \`memories/\` that reference the same data.
6. **Final pass**: re-check the audit checklist across all edited files. Verify that fixes in one file didn't create new inconsistencies in another.

## Working Rules

- **Language:** KI content is written in English. Keep it in English.
- **Do NOT delete content.** Fix, improve, restructure — but don't remove analysis that took expensive API calls to generate.
- **Preserve vid:// IDs.** You can change the title text in \`[title](vid://ID)\` but never change the ID itself.
- **One file = one KI.** Don't merge files or split them.
`;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Escape pipe characters in markdown table cells. */
function escPipe(s: string): string {
    return s.replace(/\|/g, '\\|');
}

function sanitizeFilename(title: string): string {
    return title
        .replace(/[<>:"/\\|?*]/g, '')   // Remove filesystem-unsafe chars
        .replace(/\s+/g, ' ')            // Collapse whitespace
        .trim()
        .slice(0, 100);                  // Cap length
}

function formatTimestamp(ts: { toDate?: () => Date }): string {
    if (ts?.toDate) {
        return ts.toDate().toISOString().slice(0, 10);
    }
    return 'unknown';
}

/** Format ISO date string to human-readable: "2025-10-23T02:00:04Z" → "Oct 23, 2025" */
function formatPublishedDate(iso?: string): string | undefined {
    if (!iso) return undefined;
    try {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return iso;
    }
}

function formatViews(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.onclick = (e) => e.stopPropagation();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
