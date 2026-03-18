// =============================================================================
// linkifyVideoIds — enrich markdown text with interactive video references.
//
// Primary rendering-layer mechanism for video references: any known video ID
// in the text automatically becomes an interactive badge with title and tooltip.
// Works regardless of how the text was produced (LLM, user input, stored KI).
//
// Used by:
//   - Knowledge UI (vid:// scheme)
//   - Chat UI (mention:// scheme)
//
// Protected zones (never replaced inside):
//   - Fenced code blocks (```...```)
//   - Inline code (`...`)
//   - Existing markdown links [text](url)
//   - URLs containing video IDs (e.g. ?v=ID)
// =============================================================================

type VideoIdEntry = { title?: string };

type LinkScheme = 'vid' | 'mention';

// Regex to match fenced code blocks and inline code spans.
// Group 1: fenced block content, Group 2: inline code content.
const CODE_RE = /(```[\s\S]*?```|`[^`]+`)/g;

// Placeholder prefix unlikely to appear in real text
const PLACEHOLDER = '\x00CODE_BLOCK_';

/**
 * Wrap raw video IDs in markdown links with the given scheme.
 *
 * @param markdown - The markdown text to process
 * @param videoMap - Map of videoId → { title } for known videos
 * @param scheme - URI scheme: 'vid' (Knowledge) or 'mention' (Chat)
 */
export function linkifyVideoIds(
    markdown: string,
    videoMap: Map<string, VideoIdEntry>,
    scheme: LinkScheme = 'vid',
): string {
    if (videoMap.size === 0) return markdown;

    // 1. Extract code blocks → replace with placeholders
    const codeBlocks: string[] = [];
    let protected_ = markdown.replace(CODE_RE, (match) => {
        const index = codeBlocks.length;
        codeBlocks.push(match);
        return `${PLACEHOLDER}${index}\x00`;
    });

    // 2. Build regex for known video IDs
    //    Sort by length descending so custom-1773061458547 matches before 1773061458547
    const ids = Array.from(videoMap.keys()).sort((a, b) => b.length - a.length);
    const escapedIds = ids.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    // Two-alternative regex:
    //   1st alt: existing markdown link [...](...)  → skip (no capture group)
    //   2nd alt: bare video ID with boundary guards → capture in group 1
    //
    // Boundary guards prevent matching inside URLs (?v=ID, /ID) and words.
    // Characters in lookbehind/lookahead: \w (alphanumeric + _), /, -, =, ?, &
    const pattern = new RegExp(
        `\\[[^\\]]*\\]\\([^)]*\\)|(?<![\\w/\\-=?&#])(${escapedIds})(?![\\w/\\-])`,
        'g',
    );

    // 3. Replace bare IDs with scheme links
    protected_ = protected_.replace(pattern, (fullMatch, capturedId: string | undefined) => {
        if (!capturedId) return fullMatch; // existing markdown link — leave unchanged
        const video = videoMap.get(capturedId);
        const rawTitle = video?.title || capturedId;
        // Escape [ and ] in title to prevent breaking markdown link syntax
        const title = rawTitle.replace(/[[\]]/g, '\\$&');
        return `[${title}](${scheme}://${capturedId})`;
    });

    // 4. Restore code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
        protected_ = protected_.replace(`${PLACEHOLDER}${i}\x00`, codeBlocks[i]);
    }

    return protected_;
}
