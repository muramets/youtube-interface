// =============================================================================
// CHAT: Video Reference Utilities
// Detects "Video #N" / "Draft #N" / "Suggested 3" etc. in Gemini responses
// and converts them to special markdown links for interactive tooltips.
// Patterns are defined in referencePatterns.ts for easy editing.
// =============================================================================

import { REFERENCE_PATTERNS } from '../../../core/config/referencePatterns';

/** Compiled patterns — built once from the config. */
const COMPILED_PATTERNS = REFERENCE_PATTERNS.map(({ type, pattern }) => ({
    type,
    // Unicode-safe boundary: \\b only works for ASCII, breaks Cyrillic.
    // Negative lookbehind ensures the match isn't preceded by a letter, digit,
    // or '[' (prevents double-wrapping if Gemini already outputs markdown links).
    regex: new RegExp(`(?<![\\p{L}\\d\\[])${pattern}`, 'giu'),
}));

/**
 * All known reference types joined for regex alternation.
 * Single source of truth — add new types here to propagate everywhere.
 */
const REF_TYPES_RE = REFERENCE_PATTERNS.map(p => p.type).join('|');

/**
 * Pre-process markdown text: replace "Draft #3" with `[Draft #3](draft-ref://3)`,
 * "Video #N" with `[Video #N](video-ref://N)`, etc.
 *
 * The custom markdown `a` renderer in ChatMessageList detects these special
 * schemes and renders interactive tooltip components instead of regular links.
 *
 * @param text - Raw markdown text from Gemini
 * @returns Processed markdown with reference links injected
 */
export function injectVideoReferenceLinks(text: string): string {
    let result = text;

    // Pass 1: Standard patterns (e.g. "Видео №5", "Video #3", "Draft 1")
    for (const { type, regex } of COMPILED_PATTERNS) {
        regex.lastIndex = 0;
        result = result.replace(regex, (_match, fullText: string, num: string) => {
            return `[${fullText}](${type}-ref://${num})`;
        });
    }

    // Protect Pass 1 links from Pass 2/3 re-wrapping.
    // Without this, Pass 2 catches "#9" inside "[Video #9](...)" because it's
    // within 30 chars of a previous ref, creating nested brackets that break markdown.
    const savedLinks: string[] = [];
    result = result.replace(/\[[^\]]+\]\([^)]*-ref:\/\/\d+\)/g, (match) => {
        savedLinks.push(match);
        return `\x00REF${savedLinks.length - 1}\x00`;
    });

    // Pass 2: Contextual catch-up — orphaned №N / #N near an already-injected ref.
    // Inherits the ref type from the nearest preceding reference (e.g. draft-ref stays draft).
    result = result.replace(
        new RegExp(`(?<=(?:${REF_TYPES_RE})-ref:\\/\\/\\d+\\).{0,30})([#№](\\d+))`, 'gi'),
        (_match, fullText: string, num: string, offset: number) => {
            const preceding = result.substring(Math.max(0, offset - 80), offset);
            const typeMatches = preceding.match(new RegExp(`(${REF_TYPES_RE})-ref://`, 'g'));
            const refType = typeMatches
                ? typeMatches[typeMatches.length - 1].replace('-ref://', '')
                : 'video';
            return `[${fullText}](${refType}-ref://${num})`;
        }
    );

    // Pass 3: Bare numbers after conjunction (и/and/,) near an already-injected ref.
    // Inherits the ref type from the nearest preceding reference.
    // Loop handles chains: "Драфт 1, 2 и 3" → each pass catches the next bare number.
    const bareNumPattern = new RegExp(`(?<=(?:${REF_TYPES_RE})-ref:\\/\\/\\d+\\)\\s*(?:и|and|,)\\s*)(\\d+)(?![\\d.%])`, 'gi');
    let prev = '';
    while (prev !== result) {
        prev = result;
        const currentResult = result; // capture for closure safety
        result = result.replace(bareNumPattern, (_match, num: string, offset: number) => {
            const preceding = currentResult.substring(Math.max(0, offset - 80), offset);
            const typeMatches = preceding.match(new RegExp(`(${REF_TYPES_RE})-ref://`, 'g'));
            const refType = typeMatches
                ? typeMatches[typeMatches.length - 1].replace('-ref://', '')
                : 'video';
            return `[${num}](${refType}-ref://${num})`;
        });
    }

    // Restore protected links
    result = result.replace(/\x00REF(\d+)\x00/g, (_m, idx) => savedLinks[parseInt(idx)]);

    return result;
}

/**
 * Supported reference types and their semantic meaning:
 * - video:      Published video or canvas video (unified under OWNERSHIP_CONFIG)
 * - draft:      Draft video, ownership = own-draft
 * - competitor: Competitor video, ownership = competitor
 * - suggested:  Traffic analysis suggested video (CSV data)
 * - image:      Image reference
 */
export type ReferenceType = 'video' | 'draft' | 'competitor' | 'suggested' | 'image';

/**
 * Parse a *-ref:// URI and extract the type and 1-based index.
 * Returns null if the href doesn't match any known reference scheme.
 */
export function parseReferenceHref(href: string): { type: ReferenceType; index: number } | null {
    const match = href.match(new RegExp(`^(${REF_TYPES_RE})-ref://(\\d+)$`));
    if (!match) return null;
    return { type: match[1] as ReferenceType, index: parseInt(match[2], 10) };
}

/**
 * Parse plain text (e.g. a link label) for a video reference pattern.
 * Used as a fallback when Gemini writes `[Video 3]()` with an empty href.
 * Reuses COMPILED_PATTERNS — any new pattern added to referencePatterns.ts
 * is automatically supported here.
 *
 * @param text - Plain text to scan (e.g. "Video 3", "Draft #1")
 * @returns Parsed reference or null
 */
export function parseReferenceText(text: string): { type: ReferenceType; index: number } | null {
    for (const { type, regex } of COMPILED_PATTERNS) {
        regex.lastIndex = 0;
        const match = regex.exec(text);
        if (match) {
            const num = parseInt(match[2], 10);
            if (!isNaN(num)) return { type: type as ReferenceType, index: num };
        }
    }

    // Last resort: standalone №N or #N (e.g. "Видео №5 и №4" → №4 has no keyword).
    // Safe because this function is only called on text already wrapped in [...]()
    // markdown links by injectVideoReferenceLinks — i.e. already identified as a reference.
    const standalone = text.match(/^[#№]?(\d+)$/);
    if (standalone) {
        const num = parseInt(standalone[1], 10);
        if (!isNaN(num)) return { type: 'video', index: num };
    }

    return null;
}
