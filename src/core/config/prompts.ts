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
].join('\n');


// -----------------------------------------------------------------------------
// Video Context — Preamble and section headers (chatStore.ts → formatVideoContext)
// Shown when user selects videos from the playlist page.
// -----------------------------------------------------------------------------

/** Top-level preamble explaining what the attached video data is and how fields work. */
export const VIDEO_CONTEXT_PREAMBLE = [
    '## Video Metadata',
    'The user has attached YouTube video metadata. Each video includes:',
    '- Title: the video\'s YouTube title.',
    '- Description: the video\'s YouTube description (may contain hashtags and links).',
    '- Tags: hidden YouTube SEO keywords, set by the creator. NOT the same as #hashtags in the description — separate metadata for search optimization, invisible to viewers.',
    'Only reference this data when relevant to the user\'s question.',
    '',
    'When referencing videos, use their exact label: **Video #1**, **Draft #1**, **Competitor Video #1**. Do NOT mix up these labels — each group has its own numbering.',
].join('\n');

/** Section header for user's draft videos (custom, not yet published). */
export const VIDEO_SECTION_DRAFT = [
    '### Your Draft Videos (not yet published on YouTube)',
    'Title, description, and tags are working drafts — the user may ask to review or improve them.',
].join('\n');

/** Section header for user's published videos (live on YouTube). */
export const VIDEO_SECTION_PUBLISHED = [
    '### Your Videos (live on YouTube)',
    'These are live on YouTube. The user can still update title, description, and tags for optimization.',
].join('\n');

/** Section header for competitor videos (other channels). */
export const VIDEO_SECTION_COMPETITOR = [
    '### Competitor Videos (other channels)',
    'Videos from competitor channels, provided for competitive analysis.',
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
    'When referencing these videos in your response, use the format **Suggested 1**, **Suggested 2**, etc. (e.g. "Suggested 7 has high CTR"). Do NOT use "Video N", "Draft N", or "Competitor N" for these — those formats refer to other attached context.',
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
