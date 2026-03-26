import type { DiffBlock } from './diffUtils'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TableRowInfo {
    /** Raw pipe-table line (e.g., "| A | B |") */
    line: string
    /** Diff type inherited from the parent DiffBlock */
    type: 'added' | 'removed' | 'unchanged'
}

export interface MergedTableBlock {
    kind: 'table'
    headerLine: string
    separatorLine: string
    rows: TableRowInfo[]
    headerType: 'added' | 'removed' | 'unchanged'
}

export interface RegularDisplayBlock {
    kind: 'regular'
    block: DiffBlock
}

export type DisplayBlock = MergedTableBlock | RegularDisplayBlock

// ─── Helpers ────────────────────────────────────────────────────────────────

const PIPE_ROW_RE = /^\|.+\|$/
const SEPARATOR_RE = /^\|[-:\s|]+\|$/

/** Every non-blank line in content is a pipe-table row */
function isTableContent(content: string): boolean {
    const lines = content.split('\n').filter(l => l.trim() !== '')
    return lines.length > 0 && lines.every(l => PIPE_ROW_RE.test(l.trim()))
}

// ─── Pre-processing ─────────────────────────────────────────────────────────

/**
 * Split DiffBlocks that contain BOTH pipe-table rows and non-table text
 * into separate sub-blocks. This is needed because computeDiffBlocks groups
 * all adjacent segments of the same diff type into one block — so removed
 * table rows + removed paragraph text end up in one block, which fails
 * the isTableContent check entirely.
 */
function splitMixedBlocks(blocks: DiffBlock[]): DiffBlock[] {
    const result: DiffBlock[] = []

    for (const block of blocks) {
        if (isTableContent(block.content)) {
            result.push(block)
            continue
        }

        // Check if block contains ANY pipe rows — if not, pass through
        const lines = block.content.split('\n')
        const hasPipeRows = lines.some(l => l.trim() !== '' && PIPE_ROW_RE.test(l.trim()))
        if (!hasPipeRows) {
            result.push(block)
            continue
        }

        // Split into table/non-table sub-blocks
        let tableLines: string[] = []
        let textLines: string[] = []

        const flushTable = () => {
            if (tableLines.length === 0) return
            const nonBlank = tableLines.filter(l => l.trim() !== '').length
            result.push({ content: tableLines.join('\n'), type: block.type, lineCount: nonBlank })
            tableLines = []
        }
        const flushText = () => {
            if (textLines.length === 0) return
            const nonBlank = textLines.filter(l => l.trim() !== '').length
            result.push({ content: textLines.join('\n'), type: block.type, lineCount: nonBlank })
            textLines = []
        }

        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed === '') {
                // Blank line — absorb into the active buffer
                if (tableLines.length > 0) tableLines.push(line)
                else textLines.push(line)
            } else if (PIPE_ROW_RE.test(trimmed)) {
                flushText()
                tableLines.push(line)
            } else {
                flushTable()
                textLines.push(line)
            }
        }

        flushTable()
        flushText()
    }

    return result
}

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * Post-process DiffBlock[] to merge consecutive pipe-table blocks into
 * composite MergedTableBlock structures with row-level diff types.
 *
 * 1. splitMixedBlocks — breaks blocks with mixed table/text into pure sub-blocks
 * 2. Detects runs of consecutive pure-table blocks
 * 3. Locates header + separator within the run → merges into MergedTableBlock
 * 4. Filters rows per side: left excludes 'added', right excludes 'removed'
 * 5. Orphan adoption: headerless table runs merge into the nearest prior table
 * 6. Falls back to regular blocks if table structure is invalid
 */
export function mergeTableBlocks(blocks: DiffBlock[], side: 'left' | 'right'): DisplayBlock[] {
    const split = splitMixedBlocks(blocks)
    const result: DisplayBlock[] = []
    let i = 0

    while (i < split.length) {
        if (isTableContent(split[i].content)) {
            // Collect run of consecutive table-content blocks
            const runStart = i
            while (i < split.length && isTableContent(split[i].content)) i++
            const run = split.slice(runStart, i)

            const merged = tryMergeRun(run, side)

            // Fallback produced only regular blocks (no separator in this run).
            // Try to adopt orphan rows into the most recent MergedTableBlock.
            if (merged.every(m => m.kind === 'regular') && tryAdoptOrphanRows(result, run, side)) {
                continue
            }

            result.push(...merged)
        } else {
            result.push({ kind: 'regular', block: split[i] })
            i++
        }
    }

    return result
}

/**
 * Attempt to merge a run of table-content DiffBlocks into one table.
 * Returns regular blocks as fallback if the structure is ambiguous.
 */
function tryMergeRun(run: DiffBlock[], side: 'left' | 'right'): DisplayBlock[] {
    // Flatten all pipe rows with their diff types
    const allRows: TableRowInfo[] = []
    for (const block of run) {
        for (const line of block.content.split('\n')) {
            const trimmed = line.trim()
            if (trimmed && PIPE_ROW_RE.test(trimmed)) {
                allRows.push({ line: trimmed, type: block.type })
            }
        }
    }

    // Find separator rows — require exactly one, preceded by a header
    const sepIndices = allRows
        .map((r, idx) => SEPARATOR_RE.test(r.line) ? idx : -1)
        .filter(idx => idx >= 0)

    if (sepIndices.length !== 1 || sepIndices[0] < 1) {
        return run.map(block => ({ kind: 'regular' as const, block }))
    }

    const sepIdx = sepIndices[0]
    const headerRow = allRows[sepIdx - 1]
    const separatorRow = allRows[sepIdx]
    const dataRows = allRows.filter((_, idx) => idx !== sepIdx - 1 && idx !== sepIdx)

    const spacerType: 'added' | 'removed' = side === 'left' ? 'added' : 'removed'

    // If header belongs to the spacer type, the entire table is foreign to this side
    if (headerRow.type === spacerType) {
        return [{
            kind: 'regular',
            block: {
                content: allRows.map(r => r.line).join('\n'),
                type: spacerType,
                lineCount: dataRows.length + 1,
            },
        }]
    }

    const contentRows = dataRows.filter(r => r.type !== spacerType)
    const spacerRows = dataRows.filter(r => r.type === spacerType)

    const result: DisplayBlock[] = [{
        kind: 'table',
        headerLine: headerRow.line,
        separatorLine: separatorRow.line,
        rows: contentRows,
        headerType: headerRow.type,
    }]

    // Emit spacer badge for rows excluded from this side's table
    if (spacerRows.length > 0) {
        result.push({
            kind: 'regular',
            block: {
                content: spacerRows.map(r => r.line).join('\n'),
                type: spacerType,
                lineCount: spacerRows.length,
            },
        })
    }

    return result
}

// ─── Orphan adoption ────────────────────────────────────────────────────────

/**
 * When a run of pipe-rows has no header/separator (e.g. removed rows separated
 * from their table by a paragraph block), try to merge them into the most
 * recent MergedTableBlock in `result`.
 *
 * Returns true if adoption succeeded (caller should skip emitting the run).
 */
function tryAdoptOrphanRows(result: DisplayBlock[], orphanRun: DiffBlock[], side: 'left' | 'right'): boolean {
    const lastTable = findLastTable(result)
    if (!lastTable) return false

    const spacerType: 'added' | 'removed' = side === 'left' ? 'added' : 'removed'

    const orphanRows: TableRowInfo[] = []
    for (const block of orphanRun) {
        for (const line of block.content.split('\n')) {
            const trimmed = line.trim()
            if (trimmed && PIPE_ROW_RE.test(trimmed)) {
                orphanRows.push({ line: trimmed, type: block.type })
            }
        }
    }
    if (orphanRows.length === 0) return false

    const contentRows = orphanRows.filter(r => r.type !== spacerType)
    const spacerRows = orphanRows.filter(r => r.type === spacerType)

    // Adopt content rows into the table
    lastTable.rows.push(...contentRows)

    // Emit spacer badge for excluded rows
    if (spacerRows.length > 0) {
        result.push({
            kind: 'regular',
            block: {
                content: spacerRows.map(r => r.line).join('\n'),
                type: spacerType,
                lineCount: spacerRows.length,
            },
        })
    }

    return true
}

function findLastTable(result: DisplayBlock[]): MergedTableBlock | null {
    for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].kind === 'table') return result[i] as MergedTableBlock
    }
    return null
}
