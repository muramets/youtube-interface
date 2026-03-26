import { describe, it, expect } from 'vitest'
import { mergeTableBlocks, type DisplayBlock } from '../tableDiffMerge'
import type { DiffBlock } from '../diffUtils'

// ─── Helpers ────────────────────────────────────────────────────────────────

function tableBlock(block: DisplayBlock) {
    expect(block.kind).toBe('table')
    if (block.kind !== 'table') throw new Error('Expected table block')
    return block
}

function regularBlock(block: DisplayBlock) {
    expect(block.kind).toBe('regular')
    if (block.kind !== 'regular') throw new Error('Expected regular block')
    return block.block
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('mergeTableBlocks', () => {
    describe('non-table content passes through unchanged', () => {
        it('returns regular blocks for plain text', () => {
            const blocks: DiffBlock[] = [
                { content: 'Hello world', type: 'unchanged', lineCount: 1 },
                { content: 'New paragraph', type: 'added', lineCount: 1 },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(2)
            expect(result[0].kind).toBe('regular')
            expect(result[1].kind).toBe('regular')
        })

        it('passes through mixed content (text + non-table lines)', () => {
            const blocks: DiffBlock[] = [
                { content: '### Heading\n\nSome text', type: 'unchanged', lineCount: 1 },
            ]

            const result = mergeTableBlocks(blocks, 'left')

            expect(result).toHaveLength(1)
            expect(result[0].kind).toBe('regular')
        })
    })

    describe('unchanged table stays intact', () => {
        it('wraps a single unchanged table block as MergedTableBlock', () => {
            const blocks: DiffBlock[] = [{
                content: '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |',
                type: 'unchanged',
                lineCount: 3,
            }]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.headerLine).toBe('| A | B |')
            expect(t.separatorLine).toBe('|---|---|')
            expect(t.rows).toHaveLength(2)
            expect(t.rows[0]).toEqual({ line: '| 1 | 2 |', type: 'unchanged' })
            expect(t.rows[1]).toEqual({ line: '| 3 | 4 |', type: 'unchanged' })
            expect(t.headerType).toBe('unchanged')
        })
    })

    describe('added rows — right side', () => {
        it('merges added rows into the table on right side', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |',
                    type: 'added',
                    lineCount: 1,
                },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.headerLine).toBe('| A | B |')
            expect(t.rows).toHaveLength(2)
            expect(t.rows[0]).toEqual({ line: '| 1 | 2 |', type: 'unchanged' })
            expect(t.rows[1]).toEqual({ line: '| 3 | 4 |', type: 'added' })
        })
    })

    describe('added rows — left side (spacer)', () => {
        it('excludes added rows from table on left side and emits spacer', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |',
                    type: 'added',
                    lineCount: 1,
                },
            ]

            const result = mergeTableBlocks(blocks, 'left')

            expect(result).toHaveLength(2)

            const t = tableBlock(result[0])
            expect(t.rows).toHaveLength(1)
            expect(t.rows[0]).toEqual({ line: '| 1 | 2 |', type: 'unchanged' })

            const spacer = regularBlock(result[1])
            expect(spacer.type).toBe('added')
            expect(spacer.lineCount).toBe(1)
        })
    })

    describe('removed rows — left side', () => {
        it('merges removed rows into the table on left side', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |',
                    type: 'unchanged',
                    lineCount: 3,
                },
                {
                    content: '| 5 | 6 |',
                    type: 'removed',
                    lineCount: 1,
                },
            ]

            const result = mergeTableBlocks(blocks, 'left')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.rows).toHaveLength(3)
            expect(t.rows[2]).toEqual({ line: '| 5 | 6 |', type: 'removed' })
        })
    })

    describe('removed rows — right side (spacer)', () => {
        it('excludes removed rows from table on right side and emits spacer', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |',
                    type: 'removed',
                    lineCount: 1,
                },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(2)

            const t = tableBlock(result[0])
            expect(t.rows).toHaveLength(1)
            expect(t.rows[0]).toEqual({ line: '| 1 | 2 |', type: 'unchanged' })

            const spacer = regularBlock(result[1])
            expect(spacer.type).toBe('removed')
            expect(spacer.lineCount).toBe(1)
        })
    })

    describe('entirely new table (all added)', () => {
        it('shows full table on right side with all rows as added', () => {
            const blocks: DiffBlock[] = [{
                content: '| X | Y |\n|---|---|\n| a | b |',
                type: 'added',
                lineCount: 2,
            }]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.headerType).toBe('added')
            expect(t.rows).toHaveLength(1)
            expect(t.rows[0].type).toBe('added')
        })

        it('emits spacer on left side for entirely new table', () => {
            const blocks: DiffBlock[] = [{
                content: '| X | Y |\n|---|---|\n| a | b |',
                type: 'added',
                lineCount: 2,
            }]

            const result = mergeTableBlocks(blocks, 'left')

            expect(result).toHaveLength(1)
            const spacer = regularBlock(result[0])
            expect(spacer.type).toBe('added')
        })
    })

    describe('entirely removed table', () => {
        it('shows full table on left side with all rows as removed', () => {
            const blocks: DiffBlock[] = [{
                content: '| X | Y |\n|---|---|\n| a | b |',
                type: 'removed',
                lineCount: 2,
            }]

            const result = mergeTableBlocks(blocks, 'left')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.headerType).toBe('removed')
            expect(t.rows).toHaveLength(1)
            expect(t.rows[0].type).toBe('removed')
        })

        it('emits spacer on right side for entirely removed table', () => {
            const blocks: DiffBlock[] = [{
                content: '| X | Y |\n|---|---|\n| a | b |',
                type: 'removed',
                lineCount: 2,
            }]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const spacer = regularBlock(result[0])
            expect(spacer.type).toBe('removed')
        })
    })

    describe('mixed table and non-table blocks', () => {
        it('only merges table blocks, leaves text blocks intact', () => {
            const blocks: DiffBlock[] = [
                { content: '### Evidence Table', type: 'unchanged', lineCount: 1 },
                { content: '| A | B |\n|---|---|\n| 1 | 2 |', type: 'unchanged', lineCount: 2 },
                { content: '| 3 | 4 |', type: 'added', lineCount: 1 },
                { content: 'Some conclusion text.', type: 'unchanged', lineCount: 1 },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(3)
            expect(result[0].kind).toBe('regular') // heading
            expect(result[1].kind).toBe('table')   // merged table
            expect(result[2].kind).toBe('regular') // conclusion text

            const t = tableBlock(result[1])
            expect(t.rows).toHaveLength(2)
            expect(t.rows[1].type).toBe('added')
        })
    })

    describe('multiple separators fallback', () => {
        it('falls back to regular blocks when run has 2+ separators (column change)', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'removed',
                    lineCount: 2,
                },
                {
                    content: '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                    type: 'added',
                    lineCount: 2,
                },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(2)
            expect(result[0].kind).toBe('regular')
            expect(result[1].kind).toBe('regular')
        })
    })

    describe('table with alignment separators', () => {
        it('handles separator with colons (alignment markers)', () => {
            const blocks: DiffBlock[] = [{
                content: '| Left | Center | Right |\n|:---|:---:|---:|\n| a | b | c |',
                type: 'unchanged',
                lineCount: 2,
            }]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.separatorLine).toBe('|:---|:---:|---:|')
            expect(t.rows).toHaveLength(1)
        })
    })

    describe('multiple added rows', () => {
        it('merges multiple added rows into the table', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |\n| 5 | 6 |\n| 7 | 8 |',
                    type: 'added',
                    lineCount: 3,
                },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.rows).toHaveLength(4)
            expect(t.rows[0].type).toBe('unchanged')
            expect(t.rows[1].type).toBe('added')
            expect(t.rows[2].type).toBe('added')
            expect(t.rows[3].type).toBe('added')
        })

        it('creates spacer with correct lineCount for multiple excluded rows', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |\n| 5 | 6 |',
                    type: 'added',
                    lineCount: 2,
                },
            ]

            const result = mergeTableBlocks(blocks, 'left')

            expect(result).toHaveLength(2)
            const spacer = regularBlock(result[1])
            expect(spacer.lineCount).toBe(2)
        })
    })

    describe('orphan row adoption', () => {
        it('adopts orphan removed rows into the previous table (right side)', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |',
                    type: 'added',
                    lineCount: 1,
                },
                // Non-table block breaks the run
                { content: 'Some paragraph text.', type: 'removed', lineCount: 1 },
                // Orphan table rows — no header/separator
                {
                    content: '| 5 | 6 |\n| 7 | 8 |',
                    type: 'removed',
                    lineCount: 2,
                },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            // Table should adopt the orphan rows (excluded as spacer on right side)
            expect(result).toHaveLength(3) // table + paragraph + spacer
            const t = tableBlock(result[0])
            expect(t.rows).toHaveLength(2) // 1 unchanged + 1 added
            expect(result[1].kind).toBe('regular') // paragraph
            // Orphan removed rows become spacer on right side
            expect(result[2].kind).toBe('regular')
            expect(regularBlock(result[2]).type).toBe('removed')
            expect(regularBlock(result[2]).lineCount).toBe(2)
        })

        it('adopts orphan removed rows into the previous table (left side)', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |',
                    type: 'added',
                    lineCount: 1,
                },
                // Non-table block breaks the run
                { content: 'Paragraph.', type: 'unchanged', lineCount: 1 },
                // Orphan removed rows
                {
                    content: '| 5 | 6 |\n| 7 | 8 |',
                    type: 'removed',
                    lineCount: 2,
                },
            ]

            const result = mergeTableBlocks(blocks, 'left')

            // On left: added rows are spacers, removed rows are content
            const t = tableBlock(result[0])
            // Table: 1 unchanged + 2 adopted removed rows
            expect(t.rows).toHaveLength(3)
            expect(t.rows[0]).toEqual({ line: '| 1 | 2 |', type: 'unchanged' })
            expect(t.rows[1]).toEqual({ line: '| 5 | 6 |', type: 'removed' })
            expect(t.rows[2]).toEqual({ line: '| 7 | 8 |', type: 'removed' })
        })

        it('does not adopt if no previous table exists', () => {
            const blocks: DiffBlock[] = [
                { content: 'Some text.', type: 'unchanged', lineCount: 1 },
                { content: '| 1 | 2 |', type: 'removed', lineCount: 1 },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(2)
            expect(result[0].kind).toBe('regular')
            expect(result[1].kind).toBe('regular')
        })
    })

    describe('mixed-content block splitting', () => {
        it('splits a block with table rows + paragraph text, adopts rows into table', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                {
                    content: '| 3 | 4 |',
                    type: 'added',
                    lineCount: 1,
                },
                // This block has table rows AND paragraph text mixed together
                // (diff grouped all removed segments into one block)
                {
                    content: 'Some analysis paragraph.\n| 5 | 6 |\n| 7 | 8 |',
                    type: 'removed',
                    lineCount: 3,
                },
            ]

            const result = mergeTableBlocks(blocks, 'right')

            // On right side: removed rows are spacers
            // Table should have unchanged + added rows
            // Paragraph should be a regular block
            // Removed orphan rows should be adopted as spacer
            const tables = result.filter(r => r.kind === 'table')
            expect(tables).toHaveLength(1)

            const t = tableBlock(tables[0])
            expect(t.rows).toHaveLength(2) // 1 unchanged + 1 added

            // Should have regular blocks for paragraph + spacer
            const regulars = result.filter(r => r.kind === 'regular')
            expect(regulars.length).toBeGreaterThanOrEqual(1)

            // The paragraph text should survive as a regular block
            const paragraphBlock = regulars.find(r =>
                r.kind === 'regular' && r.block.content.includes('Some analysis paragraph'),
            )
            expect(paragraphBlock).toBeDefined()
        })

        it('splits mixed block and merges table rows into existing table (left side)', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                // Mixed: paragraph + table rows, all removed
                {
                    content: 'Removed paragraph.\n| 3 | 4 |\n| 5 | 6 |',
                    type: 'removed',
                    lineCount: 3,
                },
            ]

            const result = mergeTableBlocks(blocks, 'left')

            // Left side: removed rows are content (shown in table)
            const t = tableBlock(result.find(r => r.kind === 'table')!)
            expect(t.rows).toHaveLength(3) // 1 unchanged + 2 adopted removed
            expect(t.rows[1]).toEqual({ line: '| 3 | 4 |', type: 'removed' })
            expect(t.rows[2]).toEqual({ line: '| 5 | 6 |', type: 'removed' })
        })

        it('handles table rows before paragraph text in same block', () => {
            const blocks: DiffBlock[] = [
                {
                    content: '| A | B |\n|---|---|\n| 1 | 2 |',
                    type: 'unchanged',
                    lineCount: 2,
                },
                // Table rows come FIRST, then paragraph
                {
                    content: '| 3 | 4 |\nSome text after table.',
                    type: 'removed',
                    lineCount: 2,
                },
            ]

            const result = mergeTableBlocks(blocks, 'left')

            // Table rows should be merged, text should be separate
            const tables = result.filter(r => r.kind === 'table')
            expect(tables).toHaveLength(1)
            const t = tableBlock(tables[0])
            // On left, removed = content → adopted into table
            expect(t.rows.some(r => r.line === '| 3 | 4 |' && r.type === 'removed')).toBe(true)

            // Text should be a regular block
            const textBlock = result.find(r =>
                r.kind === 'regular' && r.block.content.includes('Some text after table'),
            )
            expect(textBlock).toBeDefined()
        })
    })

    describe('whitespace handling', () => {
        it('trims pipe rows with leading/trailing whitespace', () => {
            const blocks: DiffBlock[] = [{
                content: '  | A | B |  \n  |---|---|  \n  | 1 | 2 |  ',
                type: 'unchanged',
                lineCount: 2,
            }]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.headerLine).toBe('| A | B |')
            expect(t.rows[0].line).toBe('| 1 | 2 |')
        })

        it('skips blank lines within table content', () => {
            const blocks: DiffBlock[] = [{
                content: '| A | B |\n\n|---|---|\n\n| 1 | 2 |',
                type: 'unchanged',
                lineCount: 2,
            }]

            const result = mergeTableBlocks(blocks, 'right')

            expect(result).toHaveLength(1)
            const t = tableBlock(result[0])
            expect(t.rows).toHaveLength(1)
        })
    })
})
