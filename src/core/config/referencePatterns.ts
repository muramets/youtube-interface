// =============================================================================
// CHAT: Video Reference Patterns
// Configurable regex patterns for detecting video/image references in Gemini
// responses. Add new patterns here to expand detection coverage.
// =============================================================================

/**
 * Each pattern entry defines:
 * - `type`:    Reference type — determines the URI scheme used in markdown links.
 *              Built-in types: 'video', 'draft', 'competitor', 'suggested', 'image'
 * - `pattern`: Regex with TWO capture groups:
 *              (1) Full matched text (e.g. "Draft #3", "Video 2")
 *              (2) The numeric index (e.g. "3")
 *   Flags `gi` are applied automatically — no need to include them.
 *
 * To add a new pattern:
 * 1. Add an entry below with the appropriate type and regex
 * 2. Test with: "Your pattern text here".match(new RegExp(pattern, 'gi'))
 *
 * Examples:
 *   { type: 'video', pattern: '((?:Thumbnail)\\s*#?(\\d+))' }
 *   { type: 'image', pattern: '((?:Cover|Обкладинк[аеуи])\\s*#?(\\d+))' }
 */
export const REFERENCE_PATTERNS: { type: string; pattern: string }[] = [
    // --- Ownership-prefixed video patterns (standalone video cards) ---
    { type: 'draft', pattern: '((?:Draft|Драфт|драфт|Черновик|черновик)\\s*[#№]?(\\d+))' },
    { type: 'competitor', pattern: '((?:Competitor\\s+Video|Competitor|Конкурент|конкурент)\\s*[#№]?(\\d+))' },

    // --- Generic video patterns (canvas context) ---
    { type: 'video', pattern: '((?:Video|Видео|видео)\\s*[#№]?(\\d+))' },

    // --- Suggested traffic video patterns (CSV traffic analysis) ---
    { type: 'suggested', pattern: '((?:SV|Suggested Video|Suggested)\\s*[#№]?(\\d+))' },

    // --- Image / cover patterns ---
    { type: 'image', pattern: '((?:Image|Картинк[аеуи]|картинк[аеуи]|Обложк[аеуи]|обложк[аеуи])\\s*[#№]?(\\d+))' },
];

// =============================================================================
// Ownership Config — single source of truth for ownership-based mappings.
// Used by: systemPrompt (chatStore), referenceVideoMap (ChatMessageList),
//          tooltip labels (VideoReferenceTooltip), UI badges (ContextAccordion).
// =============================================================================

export interface OwnershipConfig {
    /** Full label for display and systemPrompt (e.g. 'Draft', 'Video') */
    label: string;
    /** Reference type key matching REFERENCE_PATTERNS (e.g. 'draft', 'video') */
    refType: string;
    /** Short prefix for UI badges (e.g. 'D', 'P', 'C') */
    badgePrefix: string;
}

/** Keyed by VideoCardContext.ownership values. */
export const OWNERSHIP_CONFIG: Record<string, OwnershipConfig> = {
    'own-draft': { label: 'Draft', refType: 'draft', badgePrefix: 'D' },
    'own-published': { label: 'Video', refType: 'video', badgePrefix: '' },
    'competitor': { label: 'Competitor Video', refType: 'competitor', badgePrefix: 'C' },
};

/** Display labels per reference type — used by VideoReferenceTooltip for canonical @mention text.
 *  Derived from OWNERSHIP_CONFIG to stay DRY; only non-ownership types added manually. */
export const REF_TYPE_LABELS: Record<string, string> = {
    ...Object.fromEntries(
        Object.values(OWNERSHIP_CONFIG).map(c => [c.refType, c.label])
    ),
    suggested: 'Suggested',
    image: 'Image',
};
