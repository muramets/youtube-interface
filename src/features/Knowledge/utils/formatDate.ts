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
 * Creation origin label — who created the KI (badge text).
 * SSOT for badges on KnowledgeCard, KnowledgeItemModal, VersionDropdown.
 */
export function getOriginLabel(source: string): string {
    if (source === 'conclude') return 'Memorize'
    if (source === 'manual') return 'Manual'
    if (source === 'chat-edit') return 'LLM Edit'
    return 'Chat'
}

/**
 * Edit provenance label — who last edited (companion text, conditional).
 * Shown only when KI has been edited (lastEditSource exists).
 */
export function getEditLabel(source: string): string {
    if (source === 'manual') return 'Manually edited'
    return 'LLM edited'
}

/**
 * Combined source label for version entries — context for each historical snapshot.
 * Used by VersionDropdown version list and formatVersionLabel.
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
