// =============================================================================
// normalizeLastUpdated — converts Firestore lastUpdated to ISO string
//
// Firestore can store lastUpdated as:
//   1. string (already ISO)
//   2. number (epoch milliseconds)
//   3. Firestore Timestamp (has .toDate() method)
//   4. native Date
//   5. null / undefined
//
// This utility normalizes all formats to ISO string | null.
// Used by all Layer 4 handlers for consistent dataFreshness output.
// =============================================================================

/**
 * Normalize a Firestore `lastUpdated` field to an ISO 8601 string.
 *
 * @param value  Raw value from Firestore document
 * @returns ISO string or null if value is missing/unrecognizable
 */
export function normalizeLastUpdated(value: unknown): string | null {
    if (!value && value !== 0) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number") return new Date(value).toISOString();
    if (typeof (value as { toDate?: unknown }).toDate === "function") {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    return null;
}
