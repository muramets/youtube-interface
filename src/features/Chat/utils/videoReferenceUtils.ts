// =============================================================================
// CHAT: Video Reference Utilities
// Detects "Video #N" / "Draft #N" / "Suggested 3" etc. in Gemini responses
// and converts them to special markdown links for interactive tooltips.
// Patterns are defined in referencePatterns.ts for easy editing.
// =============================================================================

import { REFERENCE_PATTERNS } from '../../../core/config/referencePatterns';
import type { VideoCardContext } from '../../../core/types/appContext';

/** Compiled patterns — built once from the config. */
const COMPILED_PATTERNS = REFERENCE_PATTERNS.map(({ type, pattern }) => ({
    type,
    // Unicode-safe boundary: \\b only works for ASCII, breaks Cyrillic.
    // Negative lookbehind ensures the match isn't preceded by a letter, digit,
    // or '[' (prevents double-wrapping if Gemini already outputs markdown links).
    // Allow `@` prefix for explicit mentions.
    regex: new RegExp(`(?<![\\p{L}\\d\\[])_?@?${pattern}`, 'giu'),
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
 * It uses Contextual Fallback Resolution: if Gemini abbreviates "Competitor Video 4"
 * as "Video 4", the parser checks `videoMap` (Ground Truth). If `video-4` doesn't exist
 * but `competitor-4` does, it auto-corrects the type to `competitor`.
 *
 * @param text - Raw markdown text from Gemini
 * @param videoMap - Local context dictionary to resolve dropped prefixes (Ground Truth)
 * @param overrides - Tier 3 overrides set by the user (e.g., { "4": "competitor-4" })
 * @returns Processed markdown with reference links injected
 */
export function injectVideoReferenceLinks(text: string, videoMap?: Map<string, VideoCardContext>, overrides?: Record<string, string>): string {
    let result = text;

    // Helper: Contextual Fallback Resolution
    // Resolves AI Hallucinations where Gemini drops prefixes (e.g. writes "Video #4" instead of "Competitor Video #4").
    const resolveContextualFallback = (type: string, num: string, fullText: string): string => {
        // Tier 3: Human-in-the-Loop Override. Always wins.
        if (overrides && overrides[num]) {
            // Override value is a reference key like "competitor-4" or "draft-2".
            // Split on the last hyphen to get the type portion.
            const lastDash = overrides[num].lastIndexOf('-');
            if (lastDash > 0) {
                const overrideType = overrides[num].substring(0, lastDash);
                return `[${fullText}](${overrideType}-ref://${num})`;
            }
        }

        let finalType = type;

        // Tier 2: Safe Auto-Fallback (only if type is generic 'video')
        if (videoMap && type === 'video') {
            const hasVideo = videoMap.has(`video-${num}`);
            if (!hasVideo) {
                // If it's not a standard video, see what else exists with this number in the context
                const alternatives = [];
                if (videoMap.has(`competitor-${num}`)) alternatives.push('competitor');
                if (videoMap.has(`draft-${num}`)) alternatives.push('draft');
                if (videoMap.has(`suggested-${num}`)) alternatives.push('suggested');

                // MATHEMATICALLY SAFE: Only auto-correct if exactly ONE alternative exists.
                // If 0, do nothing (maybe it's completely hallucinated).
                // If >1, it's a collision. Do nothing and let Tier 3 (user override) handle it if needed.
                if (alternatives.length === 1) {
                    finalType = alternatives[0];
                }
            }
        }

        return `[${fullText}](${finalType}-ref://${num})`;
    };

    const savedLinks: string[] = [];

    // Pass 1: Standard patterns (e.g. "Видео №5", "Video #3", "Draft 1")
    for (const { type, regex } of COMPILED_PATTERNS) {
        regex.lastIndex = 0;
        result = result.replace(regex, (_match, fullText: string, num: string) => {
            const resolved = resolveContextualFallback(type, num, fullText);
            savedLinks.push(resolved);
            return `\uFFF0REF${savedLinks.length - 1}\uFFF0`;
        });
    }

    // Helper to safely get the reference type from the nearest preceding saved link
    const getPrecedingRefType = (currentStr: string, offset: number): string => {
        const preceding = currentStr.substring(Math.max(0, offset - 80), offset);
        const refMatch = preceding.match(/\uFFF0REF(\d+)\uFFF0/g);
        if (refMatch) {
            const lastRefIdx = parseInt(refMatch[refMatch.length - 1].replace(/[^\d]/g, ''), 10);
            const originalLink = savedLinks[lastRefIdx];
            const typeMatch = originalLink?.match(/\(([^)]+)-ref:\/\//);
            if (typeMatch) return typeMatch[1];
        }
        return 'video'; // Default fallback
    };

    // Pass 2: Contextual catch-up — orphaned №N / #N near an already-injected ref.
    // Inherits the ref type from the nearest preceding reference (e.g. draft-ref stays draft).
    result = result.replace(
        new RegExp(`(?<=\\uFFF0REF\\d+\\uFFF0.{0,30})([#№](\\d+))`, 'gi'),
        (_match, fullText: string, num: string, offset: number) => {
            const refType = getPrecedingRefType(result, offset);
            return `\uFFF0REF${savedLinks.push(`[${fullText}](${refType}-ref://${num})`) - 1}\uFFF0`;
        }
    );

    // Pass 3: Bare numbers after conjunction (и/and/,) near an already-injected ref.
    // Inherits the ref type from the nearest preceding reference.
    // Captures optional # or № prefix included with commas to handle ", #6, #7".
    // Loop handles chains: "Драфт 1, 2 и #3" → each pass catches the next sequential number.
    const bareNumPattern = new RegExp(`(?<=\\uFFF0REF\\d+\\uFFF0\\s*(?:и|and|,| и | and | , )\\s*)([#№]?\\s*\\d+)(?![\\d.%])`, 'gi');
    let prev = '';
    while (prev !== result) {
        prev = result;
        const currentResult = result; // capture for closure safety
        result = result.replace(bareNumPattern, (_match, numWithPrefix: string, offset: number) => {
            const numMatch = numWithPrefix.match(/\d+/);
            const num = numMatch ? numMatch[0] : '';
            const refType = getPrecedingRefType(currentResult, offset);

            return `\uFFF0REF${savedLinks.push(`[${numWithPrefix}](${refType}-ref://${num})`) - 1}\uFFF0`;
        });
    }

    // Restore protected links
    result = result.replace(/\uFFF0REF(\d+)\uFFF0/g, (_m, idx) => savedLinks[parseInt(idx)]);

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
