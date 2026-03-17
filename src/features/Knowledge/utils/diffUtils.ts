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
 * Split markdown into non-blank lines for comparison.
 * Filters out blank lines to ignore spacing differences between serializers.
 */
function splitContentLines(md: string): string[] {
    return md.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim() !== '')
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

/** Allow vid:// and mention:// URIs through ReactMarkdown's URL sanitizer. */
export const allowCustomUrls = (url: string) => url
