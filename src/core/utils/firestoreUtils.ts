/**
 * Shared Firestore utility functions.
 */

/** Parse a Firestore Timestamp, Date, or undefined into epoch millis. */
export function parseFirestoreTimestamp(raw: unknown): number | undefined {
    if (raw == null) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asAny = raw as any;
    if (typeof asAny.toMillis === 'function') return asAny.toMillis();
    if (raw instanceof Date) return raw.getTime();
    return undefined;
}
