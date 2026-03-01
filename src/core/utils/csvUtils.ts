// =============================================================================
// Shared CSV Utilities
//
// Common parsing helpers reused by both Traffic (Suggested Traffic) and
// TrafficSource (Traffic Sources) CSV parsers. Extracted to avoid duplication.
// =============================================================================

/**
 * Parse a CSV line respecting quoted fields.
 *
 * Handles:
 * - Commas inside quoted strings: `"Hello, World"` → single field
 * - Escaped quotes: `""` inside quoted fields
 * - Mixed quoted/unquoted fields
 *
 * @param str — a single line from a CSV file
 * @returns array of field values (not trimmed)
 */
export const parseCsvLine = (str: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
};

/**
 * Detect column mapping by matching CSV header names against a known dictionary.
 *
 * For each key in `knownHeaders`, searches the `headers` array for a match
 * (case-insensitive substring match). Returns a mapping object where each key
 * maps to the column index, or -1 if not found.
 *
 * @param headers   — lowercase header strings from the first CSV line
 * @param knownHeaders — dictionary: field name → list of known header variants
 * @returns mapping object with column indices, or null if zero matches
 *
 * @example
 * ```ts
 * const mapping = detectColumnMapping(
 *   ['traffic source', 'views', 'watch time (hours)'],
 *   { source: ['Traffic source'], views: ['Views'], watchTime: ['Watch time'] }
 * );
 * // → { source: 0, views: 1, watchTime: 2 }
 * ```
 */
export const detectColumnMapping = <K extends string>(
    headers: string[],
    knownHeaders: Record<K, string[]>
): Record<K, number> | null => {
    const keys = Object.keys(knownHeaders) as K[];
    const mapping = {} as Record<K, number>;
    let foundCount = 0;

    for (const key of keys) {
        const keywords = knownHeaders[key];
        const index = headers.findIndex(h =>
            keywords.some(k => h.includes(k.toLowerCase()))
        );
        mapping[key] = index;
        if (index !== -1) foundCount++;
    }

    return foundCount === 0 ? null : mapping;
};

/**
 * Clean a CSV field value: remove surrounding quotes and trim whitespace.
 */
export const cleanCsvField = (s: string | undefined): string =>
    (s ?? '').replace(/^"|"$/g, '').trim();

/**
 * Parse a numeric CSV field, returning 0 for empty/invalid values.
 * Strips non-numeric characters except dots (for decimals) and minus signs.
 */
export const parseNumericField = (s: string | undefined): number => {
    const cleaned = cleanCsvField(s).replace(/[^0-9.-]/g, '');
    if (!cleaned) return 0;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
};

/**
 * Parse an integer CSV field, returning 0 for empty/invalid values.
 */
export const parseIntField = (s: string | undefined): number => {
    const cleaned = cleanCsvField(s).replace(/[^0-9-]/g, '');
    if (!cleaned) return 0;
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? 0 : parsed;
};
