// =============================================================================
// Firestore serialization — strips `undefined` values so Firestore doesn't reject them.
// Unlike JSON.parse(JSON.stringify(...)), this preserves Firestore Timestamps,
// which lets Firestore store them as native timestamp types.
// =============================================================================

/**
 * Recursively removes keys with `undefined` values from plain objects and arrays.
 * Preserves Firestore Timestamp instances and all other types as-is.
 */
export function stripUndefined<T>(value: T): T {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(stripUndefined) as T;
    if (typeof value === 'object' && value.constructor === Object) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            if (v !== undefined) {
                result[k] = stripUndefined(v);
            }
        }
        return result as T;
    }
    return value; // primitives, Timestamp, Date, etc. — pass through
}
