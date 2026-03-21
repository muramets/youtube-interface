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
 */
function normalizeLine(line: string): string {
    if (line.trim() === '') return ''
    return line
        .trimEnd()
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
 * blank lines (3+ newlines → 2) to reduce false-positive diffs
 * from serializer spacing differences.
 * Blank lines are PRESERVED — they're critical for markdown rendering
 * (tables, paragraph separation, list boundaries).
 */
function splitContentLines(md: string): string[] {
    const collapsed = collapseDetailsBlocks(md)
    return collapsed
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n')
}

/**
 * Compute diff blocks for left (old) and right (new) columns.
 *
 * Uses `diffArrays` with normalized comparator — ignores formatting
 * differences (whitespace, list renumbering, blank lines) but renders
 * ORIGINAL lines. Left always shows old content, right shows new content.
 */
export function computeDiffBlocks(oldContent: string, newContent: string): {
    left: DiffBlock[]
    right: DiffBlock[]
    stats: { added: number; removed: number }
} {
    const oldLines = splitContentLines(oldContent)
    const newLines = splitContentLines(newContent)

    // Pre-normalize for comparison — avoids calling normalizeLine per comparison pair
    const oldNormalized = oldLines.map(normalizeLine)
    const newNormalized = newLines.map(normalizeLine)

    const changes = diffArrays(oldNormalized, newNormalized)

    const left: DiffBlock[] = []
    const right: DiffBlock[] = []
    let added = 0
    let removed = 0
    let oldIdx = 0
    let newIdx = 0

    for (const change of changes) {
        const count = change.count ?? change.value.length

        if (change.added) {
            added += count
            const content = newLines.slice(newIdx, newIdx + count).join('\n')
            right.push({ content, type: 'added', lineCount: count })
            left.push({ content, type: 'added', lineCount: count })
            newIdx += count
        } else if (change.removed) {
            removed += count
            const content = oldLines.slice(oldIdx, oldIdx + count).join('\n')
            left.push({ content, type: 'removed', lineCount: count })
            right.push({ content, type: 'removed', lineCount: count })
            oldIdx += count
        } else {
            // Unchanged — left uses OLD lines, right uses NEW lines
            const leftContent = oldLines.slice(oldIdx, oldIdx + count).join('\n')
            const rightContent = newLines.slice(newIdx, newIdx + count).join('\n')
            left.push({ content: leftContent, type: 'unchanged', lineCount: count })
            right.push({ content: rightContent, type: 'unchanged', lineCount: count })
            oldIdx += count
            newIdx += count
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
