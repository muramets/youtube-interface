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
    return 'Chat'
}

/**
 * Edit provenance label — who last edited (companion text, conditional).
 * Returns undefined for origin sources ('chat-tool', 'conclude') — these mean
 * the content was never edited, so no edit label should be shown.
 */
export function getEditLabel(source: string): string | undefined {
    if (source === 'manual') return 'Manually edited'
    if (source === 'chat-edit') return 'LLM edited'
    return undefined
}

/**
 * Resolve edit source from a version snapshot, with backwards compatibility.
 *
 * Before provenance split (commit d191193, 2026-03-22), version snapshots stored
 * a merged value in `source` (= lastEditSource ?? source). After the split,
 * `source` = origin only, `lastEditSource` = edit provenance (separate field).
 *
 * For old versions without `lastEditSource`, falls back to `source` when the
 * value is unambiguously an edit source ('chat-edit'). Safe to remove once
 * all old version documents are superseded or deleted.
 */
type EditSource = 'chat-tool' | 'conclude' | 'manual' | 'chat-edit'

export function resolveVersionEditSource(
    lastEditSource: EditSource | undefined,
    source: string,
): EditSource | undefined {
    if (lastEditSource) return lastEditSource
    // Old format: 'chat-edit' in source field is unambiguously an edit
    if (source === 'chat-edit') return 'chat-edit'
    return undefined
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
