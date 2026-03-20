/**
 * Format a Firestore Timestamp (or plain object with seconds) to a readable date string.
 * Handles both real Timestamp objects (with toDate()) and serialized objects (with seconds).
 */
export function formatKnowledgeDate(
    timestamp: { toDate?: () => Date; seconds?: number },
    includeTime = false,
): string {
    const date = timestamp.toDate?.() ?? new Date((timestamp.seconds ?? 0) * 1000)
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
    if (includeTime) {
        options.hour = '2-digit'
        options.minute = '2-digit'
    }
    return date.toLocaleDateString('en-US', options)
}

/**
 * Human-readable label for a KI source.
 * Single source of truth — used by VersionDropdown, KnowledgeCard, KnowledgeViewer, etc.
 */
export function getSourceLabel(source: string): string {
    if (source === 'conclude') return 'via Memorize'
    if (source === 'manual') return 'Manual edit'
    if (source === 'chat-edit') return 'LLM edit'
    return 'via Chat'
}

/**
 * Format a version's createdAt + source into a human-readable label.
 * e.g. "Mar 14, 2026 — LLM edit"
 */
export function formatVersionLabel(createdAt: number, source: string): string {
    const date = new Date(createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    })
    return `${date} — ${getSourceLabel(source)}`
}
