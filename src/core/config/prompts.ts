// =============================================================================
// System Prompts — All AI prompt constants in one place
// =============================================================================
//
// Edit this file to optimize how Gemini interprets and responds to user queries.
// Each section is labeled with where it's used.
// =============================================================================

// -----------------------------------------------------------------------------
// Chat System Prompt — Style instructions (chatStore.ts → buildSystemPrompt)
// -----------------------------------------------------------------------------

/** Instruction appended when user selects "concise" response style. */
export const STYLE_CONCISE = 'Be concise and to the point. Prefer short answers.';

/** Instruction appended when user selects "detailed" response style. */
export const STYLE_DETAILED = 'Provide thorough, detailed responses with explanations and examples.';

/** Prevents models from leaking chain-of-thought reasoning into the visible response. */
export const THINKING_DISCIPLINE = 'Your response must contain ONLY the final answer. Never include: planning steps, self-corrections, draft outlines, or meta-commentary about how you will structure the response. All reasoning belongs in the thinking phase.';

// -----------------------------------------------------------------------------
// Agentic Behavior Rules — planning, tool strategy, self-check
// Injected after user prompts, before Anti-Hallucination Rules.
// -----------------------------------------------------------------------------

/** Instructions for planning, tool usage strategy, response quality, and self-checking. */
export const AGENTIC_BEHAVIOR_RULES = [
    '## Agentic Behavior',
    '',
    '### Planning',
    'For complex questions requiring 2+ tool calls, plan your approach in the thinking phase before acting.',
    'Identify what data you need, which tools to use, and in what order — then execute.',
    '',
    '### Tool Strategy',
    '- **Check context first.** Before calling any tool, check if the data is already in the attached context above. Do not call `getMultipleVideoDetails` for metrics already shown in Video Metadata.',
    '- **Batch when possible.** If you need data from multiple independent tools (e.g. video details AND thumbnails), call them in the same turn rather than sequentially.',
    '- **Telescope pattern for external channels.** Always: `getChannelOverview` → `browseChannelVideos` → `getMultipleVideoDetails`. Never skip steps.',
    '- **Traffic analysis cascade.** For traffic questions: `analyzeTrafficSources` first. If Suggested dominates → `analyzeSuggestedTraffic`. For visual comparison → `viewThumbnails`.',
    '- **Similar/competitor video search.** When the user asks to find similar videos, competitors with similar theme/topic/packaging, or visual lookalikes — call `findSimilarVideos`. Use `mode: "packaging"` for theme/title/tags, `mode: "visual"` for thumbnail/visual style, `mode: "both"` for combined search.',
    '',
    '### Response Quality',
    '- **Be specific, not generic.** Never say "improve your thumbnail" without explaining how. Reference actual data: colors, text, CTR numbers, comparisons.',
    '- **Actionable recommendations.** Each suggestion must be concrete enough for the user to act on immediately.',
    '- **Structure complex analyses.** Use sections, comparisons, and clear conclusions when analyzing multiple videos or data sources.',
    '',
    '### Error Recovery',
    'If a tool returns empty results or an error:',
    '1. Explain what happened in plain language.',
    '2. Suggest an alternative approach or a different tool that might help.',
    '3. Never leave the user at a dead end — always offer a next step.',
    '',
    '### Self-Check (before sending your response)',
    '- Every number in your response — is it from context or tool results? Never estimate or recall from training.',
    '- Every video mentioned — did you call `mentionVideo` for it?',
    '- Did you answer the actual question, or did you get sidetracked by tool results?',
].join('\n');

// -----------------------------------------------------------------------------
// Anti-Hallucination Rules — grounding instructions for data integrity
// Injected at the end of Settings Layer, before any context data.
// -----------------------------------------------------------------------------

/** Rules that force the model to only reference attached data and never invent specifics. */
export const ANTI_HALLUCINATION_RULES = [
    '## Data Integrity Rules',
    '',
    'You have access to **attached context data** (videos, traffic analytics, canvas notes) provided in this prompt.',
    'Follow these rules strictly when working with this data:',
    '',
    '1. **Only reference data from the attached context.** Do not invent, guess, or recall video titles, channel names, view counts, CTR values, tags, descriptions, or any other specific data from your training.',
    '2. **Never fabricate statistics.** If the user asks about metrics not present in the attached context, say so explicitly rather than guessing.',
    '3. **Distinguish between facts and opinions.** When providing analysis based on the attached data, state it as fact. When giving general advice not tied to specific data, explicitly mark it: *"[General insight, not based on your data]"*.',
    '4. **When data is missing**, respond with: "This information is not in the attached context. Please attach the relevant data so I can help."',
    '5. **Cross-reference by context labels.** Each video has ownership labels (your video, your draft, competitor). Use these to correctly identify whose content is being discussed.',
    '6. **Always use the `mentionVideo` tool to reference videos.** Two separate steps required: (a) make a real function call to `mentionVideo` with the videoId, (b) in your response text, write `[Video Title](mention://videoId)`. NEVER write the tool name as plain text (e.g. `mentionVideo("id")` or `Source: mentionVideo(...)`) — that does nothing, only a real function call works. videoId must be the exact ID from the `[id: ...]` annotation in the attached context or from previous tool results (e.g. `topSources[].videoId`) — never invent IDs.',
    '7. **Always analyze thumbnails when present.** Video thumbnails are attached as images in the user message. When they are present, **proactively include visual analysis** in your response — cover composition, color palette, text overlays, emotional tone, and how well the thumbnail fits the niche. Compare thumbnails against each other when multiple videos are attached.',
    '8. **Video ID extraction.** Every video in the context has an `[id: ...]` annotation — this is the videoId. When ANY tool needs a videoId (`findSimilarVideos`, `getMultipleVideoDetails`, `viewThumbnails`, `mentionVideo`, etc.), extract it directly from `[id: ...]` in the context above. Never ask the user for a videoId that is already visible in the context. If you need tags or description, call `getMultipleVideoDetails` with the extracted ID. If no matching `[id: ...]` is found, ask the user to clarify.',
    '9. **Proactive thumbnail analysis.** When your analysis leads to recommendations about CTR, click-through rates, or cover art — ALWAYS call `viewThumbnails` with the relevant video IDs to perform visual comparison yourself. Never tell the user to "look at thumbnails" or "analyze covers" — you have the `viewThumbnails` tool to do this proactively.',
].join('\n');


// -----------------------------------------------------------------------------
// Video Context — Preamble and section headers (chatStore.ts → formatVideoContext)
// Shown when user selects videos from the playlist page.
// -----------------------------------------------------------------------------

/** Top-level preamble explaining what the attached video data is and how fields work. */
export const VIDEO_CONTEXT_PREAMBLE = [
    '## Video Metadata',
    'The user has attached YouTube video metadata. Each video shows: title, key metrics (views, published date, duration).',
    '**Thumbnails are attached as images** in the user message (in the same order as videos listed below). Always analyze visuals: composition, color palette, text overlays, emotional tone, and niche fit.',
    '**View growth deltas** (24h/7d/30d) are included when available from trend snapshots. Use these to assess momentum — a video with 1M total views but +100K in 7d is trending hard, while +200 in 7d means it has plateaued.',
    '**Traffic Sources** may be included for user\'s own videos (when toggled on). These show aggregate traffic breakdown (Suggested, Browse, Search, etc.) across historical snapshots in baseline + delta format. Use this to understand WHERE views come from and how each traffic source evolved over time.',
    '',
    '**Full details (description, tags) are NOT shown here to save space.** If you need a video\'s description, tags, or other detailed fields, call the `getMultipleVideoDetails` tool with the video IDs.',
].join('\n');

/** Section header for user's draft videos (custom, not yet published). */
export const VIDEO_SECTION_DRAFT = [
    '### Your Draft Videos (not yet published on YouTube)',
    'Title, description, and tags are working drafts — the user may ask to review or improve them.',
    'Thumbnail is attached as an image — analyze it for visual appeal and suggest improvements before publishing.',
].join('\n');

/** Section header for user's published videos (live on YouTube). */
export const VIDEO_SECTION_PUBLISHED = [
    '### Your Videos (live on YouTube)',
    'These are live on YouTube. The user can still update title, description, and tags for optimization.',
    'Thumbnail is attached as an image — include visual analysis when discussing the video.',
].join('\n');

/** Section header for competitor videos (other channels). */
export const VIDEO_SECTION_COMPETITOR = [
    '### Competitor Videos (other channels)',
    'Videos from competitor channels, provided for competitive analysis.',
    'Thumbnail is attached as an image — compare visual strategy against the user\'s videos.',
].join('\n');

// -----------------------------------------------------------------------------
// Suggested Traffic Context — Section headers (chatStore.ts → formatSuggestedTrafficContext)
// Shown when user selects rows in the Suggested Traffic analysis table.
// -----------------------------------------------------------------------------

/** Top-level header for suggested traffic analysis. */
export const TRAFFIC_CONTEXT_HEADER = '## Suggested Traffic Analysis Context';

/** Section header for the user's own video (traffic source). */
export const TRAFFIC_SOURCE_HEADER = '### Your Video (Source)';

/** Section header for suggested videos that YouTube shows alongside the user's video. */
export const TRAFFIC_SUGGESTED_HEADER = [
    '### Selected Suggested Videos (YouTube shows your video alongside these)',
    '',
    'Each suggested video shows traffic metrics (impressions, CTR, views). Full metadata (description, tags) is available via `getMultipleVideoDetails` tool.',
].join('\n');

/** Explanation of what the snapshot data represents — gives Gemini domain awareness. */
export const TRAFFIC_SNAPSHOT_CONTEXT = 'This data is from a CSV export of "Suggested Traffic" from YouTube Studio — it shows which other videos YouTube recommends your video alongside.';

// -----------------------------------------------------------------------------
// Canvas Selection Context — Section headers (chatStore.ts → formatCanvasContext)
// Shown when user selects nodes on the canvas board.
// -----------------------------------------------------------------------------

/** Top-level header for canvas selection context. */
export const CANVAS_CONTEXT_HEADER = '## Canvas Board Selection';

/** Preamble explaining what the canvas selection is. */
export const CANVAS_CONTEXT_PREAMBLE =
    'The user has selected the following items from their visual canvas board. ' +
    'These may include videos, traffic analysis cards, personal notes, and images. ' +
    'The items are grouped together because the user considers them related.';

// -----------------------------------------------------------------------------
// ⚠️ Conversation Memory — Summary generation
//
// The summary system prompt lives server-side in functions/src/services/memory.ts
// (single source of truth). It cannot be shared because Cloud Functions
// have a separate build and cannot import from src/.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// ⚠️ Chat Title Generation
//
// The title generation prompt lives server-side in functions/src/services/gemini.ts
// (single source of truth). It cannot be shared because Cloud Functions
// have a separate build and cannot import from src/.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// ⚠️ Memorization (Layer 4: Cross-Conversation Memory)
//
// The CONCLUDE_SYSTEM_PROMPT lives server-side in functions/src/services/memory.ts
// It generates focused summaries when the user clicks "Memorize" in chat.
// Summaries are stored in Firestore and injected via crossConversationLayer.ts.
// -----------------------------------------------------------------------------
