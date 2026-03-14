/**
 * Format a Firestore Timestamp (or plain object with seconds) to a readable date string.
 * Handles both real Timestamp objects (with toDate()) and serialized objects (with seconds).
 */
export function formatKnowledgeDate(timestamp: { toDate?: () => Date; seconds?: number }): string {
    const date = timestamp.toDate?.() ?? new Date((timestamp.seconds ?? 0) * 1000)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
