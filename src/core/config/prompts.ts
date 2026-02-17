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
].join('\n');

/** Section header for user's draft videos (custom, not yet published). */
export const VIDEO_SECTION_DRAFT = [
    '### Your Draft Videos (not yet published on YouTube)',
    'Title, description, and tags are working drafts — the user may ask to review or improve them.',
].join('\n');

/** Section header for user's published videos (live on YouTube). */
export const VIDEO_SECTION_PUBLISHED = [
    '### Your Published Videos (live on YouTube)',
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
export const TRAFFIC_SUGGESTED_HEADER = '### Selected Suggested Videos (YouTube shows your video alongside these)';

// -----------------------------------------------------------------------------
// Conversation Memory — Summary generation (gemini.ts → generateSummary)
// Used when conversation exceeds context window and older messages get summarized.
//
// ⚠️ Server-side duplicate: functions/src/services/gemini.ts also has this prompt.
//    Cloud Functions have a separate build and cannot import from src/.
//    If you change this prompt, update it in gemini.ts as well.
// -----------------------------------------------------------------------------

export const SUMMARY_SYSTEM_PROMPT = `You are a conversation memory system. Your task is to create a comprehensive, \
structured summary that will REPLACE the original messages in future AI context.

CRITICAL: Any detail you omit will be permanently lost — the AI will have "amnesia" about it.

You MUST preserve:
1. ALL specific decisions, choices, and conclusions (with reasoning)
2. ALL technical details: names, numbers, configurations, code snippets, file paths
3. Context and motivations behind each decision
4. Unresolved questions, pending tasks, or open threads
5. User preferences, communication style, and recurring themes
6. Chronological flow of how the conversation evolved

Format: Use structured markdown with clear sections and bullet points.
Length: Be thorough. A longer, complete summary is better than a short one with gaps.`;

// -----------------------------------------------------------------------------
// Chat Title Generation — (gemini.ts → generateTitle)
// Generates a short title for new conversations based on the first message.
//
// ⚠️ Server-side duplicate: functions/src/services/gemini.ts also has this prompt.
//    If you change this prompt, update it in gemini.ts as well.
// -----------------------------------------------------------------------------

/** Prompt template for generating chat conversation titles. Use with firstMessage interpolation. */
export const TITLE_GENERATION_PROMPT = (firstMessage: string) =>
    `Generate a very short title (3-5 words, no quotes) for a chat that starts with this message:\n\n"${firstMessage.slice(0, 200)}"`;
