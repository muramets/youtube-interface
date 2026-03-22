import { diffArrays } from 'diff'

// =============================================================================
// Block-level diff (for rendered markdown diff views)
// =============================================================================

export interface DiffBlock {
    content: string
    type: 'added' | 'removed' | 'unchanged'
    lineCount: number
}

/**
 * Normalize a single line for comparison only (not rendering).
 * Strips formatting differences that don't affect content:
 * - Trailing whitespace
 * - Numbered list markers → common bullet
 * - Bullet characters (*, -, +) → common *
 * - Indentation depth (2/3/4 spaces → normalized)
 * - Horizontal rules (---, * * *, ___) → canonical form
 * - Table separator rows (|---|---| vs | --- | --- |) → canonical form
 */
function normalizeLine(line: string): string {
    if (line.trim() === '' || line.trim() === '&nbsp;') return ''
    const trimmed = line.trimEnd()

    // Horizontal rules: "---", "***", "* * *", "___" etc → canonical "---"
    if (/^[-*_\s]{3,}$/.test(trimmed) && /[-*_].*[-*_].*[-*_]/.test(trimmed)) return '---'

    // Table separator rows: "|---|---|" or "| --- | --- |" → canonical form
    if (/^\|[-:\s|]+\|$/.test(trimmed)) return trimmed.replace(/\s+/g, '')

    return trimmed
        .replace(/^\s*\d+\.\s+/, '* ')           // "  1. " → "* " (numbered → bullet)
        .replace(/^(\s*)[-+]\s+/, '$1* ')         // "  - " → "  * " (normalize bullet char)
        .replace(/^(\s*)\*\s+/, '$1* ')           // "  *  " → "  * " (normalize bullet spacing)
        .replace(/^[ \t]+/, match =>              // normalize indentation to 4-space units
            '    '.repeat(Math.round(match.replace(/\t/g, '    ').length / 4))
        )
}

/**
 * Collapse <details>...</details> blocks into single lines so they're
 * treated as atomic units in the diff (not split across multiple blocks).
 * HTML whitespace is insignificant, so replacing \n with spaces is safe.
 * Handles nested details via depth tracking.
 */
function collapseDetailsBlocks(md: string): string {
    const lines = md.split('\n')
    const result: string[] = []
    let depth = 0
    let buffer: string[] = []

    for (const line of lines) {
        const opens = (line.match(/<details/gi) || []).length
        const closes = (line.match(/<\/details>/gi) || []).length

        if (depth > 0 || opens > 0) {
            buffer.push(line)
            depth += opens - closes

            if (depth <= 0) {
                // trim: indented <details> (inside lists) would otherwise
                // start with 4+ spaces → treated as code block by CommonMark
                result.push(buffer.join(' ').trimStart())
                // Blank line after HTML block so CommonMark resumes markdown parsing
                result.push('')
                buffer = []
                depth = 0
            }
        } else {
            result.push(line)
        }
    }

    // Unclosed details — push remaining lines as-is
    if (buffer.length > 0) result.push(...buffer)

    return result.join('\n')
}

/**
 * Split markdown into lines for comparison.
 * Collapses <details> blocks first, then normalizes consecutive
 * blank lines (3+ newlines → 2) to reduce serializer spacing noise.
 */
function splitContentLines(md: string): string[] {
    const collapsed = collapseDetailsBlocks(md)
    return collapsed
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n')
}

/**
 * A content segment: one non-blank line + any trailing blank lines.
 * Blank lines are "absorbed" into the preceding content line so they
 * never produce standalone diffs (phantom "+1 line added" markers).
 */
interface Segment {
    /** Normalized content for comparison */
    key: string
    /** Start index in the original lines array (inclusive) */
    startIdx: number
    /** End index in the original lines array (exclusive) */
    endIdx: number
}

/**
 * Group lines into segments. Each non-blank line absorbs any following
 * blank lines into one segment. Comparison uses only the non-blank line's
 * normalized content, while rendering includes the trailing blank lines.
 *
 * This eliminates ALL blank-line phantom diffs generically:
 * LLM vs editor whitespace, loose vs compact lists, heading spacing, etc.
 */
function segmentize(lines: string[]): Segment[] {
    const segments: Segment[] = []
    for (let i = 0; i < lines.length; i++) {
        const key = normalizeLine(lines[i])
        if (key === '') continue

        // Absorb trailing blank lines
        let end = i + 1
        while (end < lines.length && normalizeLine(lines[end]) === '') end++

        segments.push({ key, startIdx: i, endIdx: end })
        i = end - 1
    }
    return segments
}

/**
 * Compute diff blocks for left (old) and right (new) columns.
 *
 * Uses segment-based comparison: each content line absorbs its trailing
 * blank lines, so blank-line differences never produce phantom diffs.
 * Compares normalized content keys, renders ORIGINAL lines (with blanks).
 */
export function computeDiffBlocks(oldContent: string, newContent: string): {
    left: DiffBlock[]
    right: DiffBlock[]
    stats: { added: number; removed: number }
} {
    const oldLines = splitContentLines(oldContent)
    const newLines = splitContentLines(newContent)

    const oldSegments = segmentize(oldLines)
    const newSegments = segmentize(newLines)

    const changes = diffArrays(
        oldSegments.map(s => s.key),
        newSegments.map(s => s.key),
    )

    const left: DiffBlock[] = []
    const right: DiffBlock[] = []
    let added = 0
    let removed = 0
    let osi = 0
    let nsi = 0

    for (const change of changes) {
        const count = change.count ?? change.value.length

        if (change.added) {
            added += count
            const start = newSegments[nsi].startIdx
            const end = newSegments[nsi + count - 1].endIdx
            const content = newLines.slice(start, end).join('\n')
            right.push({ content, type: 'added', lineCount: count })
            left.push({ content, type: 'added', lineCount: count })
            nsi += count
        } else if (change.removed) {
            removed += count
            const start = oldSegments[osi].startIdx
            const end = oldSegments[osi + count - 1].endIdx
            const content = oldLines.slice(start, end).join('\n')
            left.push({ content, type: 'removed', lineCount: count })
            right.push({ content, type: 'removed', lineCount: count })
            osi += count
        } else {
            // Unchanged — left uses OLD lines, right uses NEW lines
            const oldStart = oldSegments[osi].startIdx
            const oldEnd = oldSegments[osi + count - 1].endIdx
            const newStart = newSegments[nsi].startIdx
            const newEnd = newSegments[nsi + count - 1].endIdx

            const leftContent = oldLines.slice(oldStart, oldEnd).join('\n')
            const rightContent = newLines.slice(newStart, newEnd).join('\n')
            left.push({ content: leftContent, type: 'unchanged', lineCount: count })
            right.push({ content: rightContent, type: 'unchanged', lineCount: count })
            osi += count
            nsi += count
        }
    }

    return { left, right, stats: { added, removed } }
}

/**
 * Allow only safe protocols through ReactMarkdown's URL sanitizer.
 * Defense-in-depth alongside rehypeSanitize — blocks javascript:, data:, etc.
 */
const ALLOWED_PROTOCOL_RE = /^(https?|vid|mention|ki):\/\//
export const allowCustomUrls = (url: string): string => {
    if (ALLOWED_PROTOCOL_RE.test(url)) return url
    // Allow relative URLs (no protocol prefix)
    if (!url.includes(':') || url.startsWith('#') || url.startsWith('/') || url.startsWith('?')) return url
    return ''
}
