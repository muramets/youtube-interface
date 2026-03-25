import { describe, it, expect } from 'vitest';
import { groupToolCalls, getGroupLabel, isExpandable } from '../toolCallGrouping';
import type { ToolCallGroup } from '../toolCallGrouping';
import type { ToolCallRecord } from '../../../../core/types/chat/chat';

function makeRecord(overrides: Partial<ToolCallRecord> & { name: string }): ToolCallRecord {
    return {
        args: {},
        ...overrides,
    };
}

function makeGroup(overrides: Partial<ToolCallGroup> & { toolName: string }): ToolCallGroup {
    return {
        records: [],
        videoIds: [],
        allResolved: true,
        hasErrors: false,
        preparing: false,
        ...overrides,
    };
}

describe('toolCallGrouping — searchDatabase', () => {
    // -----------------------------------------------------------------------
    // Video ID extraction
    // -----------------------------------------------------------------------

    describe('extractVideoIds', () => {
        it('extracts video IDs from searchDatabase results', () => {
            const records: ToolCallRecord[] = [
                makeRecord({
                    name: 'searchDatabase',
                    args: { query: 'cooking' },
                    result: {
                        results: [
                            { videoId: 'sd1', title: 'Result 1' },
                            { videoId: 'sd2', title: 'Result 2' },
                            { videoId: 'sd3', title: 'Result 3' },
                        ],
                    },
                }),
            ];

            const groups = groupToolCalls(records);
            const sdGroup = groups.find(g => g.toolName === 'searchDatabase')!;

            expect(sdGroup.videoIds).toEqual(['sd1', 'sd2', 'sd3']);
        });

        it('deduplicates video IDs across multiple searchDatabase calls', () => {
            const records: ToolCallRecord[] = [
                makeRecord({
                    name: 'searchDatabase',
                    args: { query: 'cooking' },
                    result: {
                        results: [
                            { videoId: 'sd1', title: 'Result 1' },
                            { videoId: 'sd2', title: 'Result 2' },
                        ],
                    },
                }),
                makeRecord({
                    name: 'searchDatabase',
                    args: { query: 'baking' },
                    result: {
                        results: [
                            { videoId: 'sd2', title: 'Result 2' },
                            { videoId: 'sd3', title: 'Result 3' },
                        ],
                    },
                }),
            ];

            const groups = groupToolCalls(records);
            const sdGroup = groups.find(g => g.toolName === 'searchDatabase')!;

            expect(sdGroup.videoIds).toEqual(['sd1', 'sd2', 'sd3']);
        });

        it('returns empty videoIds when result has no results array', () => {
            const records: ToolCallRecord[] = [
                makeRecord({
                    name: 'searchDatabase',
                    args: { query: 'test' },
                    result: { error: 'Query too short' },
                }),
            ];

            const groups = groupToolCalls(records);
            const sdGroup = groups.find(g => g.toolName === 'searchDatabase')!;

            expect(sdGroup.videoIds).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // Labels
    // -----------------------------------------------------------------------

    describe('getGroupLabel', () => {
        it('returns error label when searchDatabase has errors', () => {
            const group = makeGroup({
                toolName: 'searchDatabase',
                hasErrors: true,
                allResolved: true,
                records: [makeRecord({
                    name: 'searchDatabase',
                    result: { error: 'Failed' },
                })],
            });

            expect(getGroupLabel(group)).toBe("Couldn't search database");
        });

        it('returns loading label when searchDatabase is pending', () => {
            const group = makeGroup({
                toolName: 'searchDatabase',
                allResolved: false,
                records: [makeRecord({
                    name: 'searchDatabase',
                    result: undefined,
                })],
            });

            expect(getGroupLabel(group)).toBe('Searching database...');
        });

        it('returns result count and query when resolved', () => {
            const group = makeGroup({
                toolName: 'searchDatabase',
                allResolved: true,
                records: [makeRecord({
                    name: 'searchDatabase',
                    result: {
                        query: 'cooking tutorial',
                        results: [
                            { videoId: 'v1' },
                            { videoId: 'v2' },
                            { videoId: 'v3' },
                        ],
                        totalFound: 15,
                    },
                })],
                videoIds: ['v1', 'v2', 'v3'],
            });

            expect(getGroupLabel(group)).toBe('3 results for "cooking tutorial"');
        });

        it('returns result count without query as fallback', () => {
            const group = makeGroup({
                toolName: 'searchDatabase',
                allResolved: true,
                records: [makeRecord({
                    name: 'searchDatabase',
                    result: {
                        results: [{ videoId: 'v1' }],
                    },
                })],
                videoIds: ['v1'],
            });

            expect(getGroupLabel(group)).toBe('1 search result');
        });

        it('pluralizes correctly for multiple results without query', () => {
            const group = makeGroup({
                toolName: 'searchDatabase',
                allResolved: true,
                records: [makeRecord({
                    name: 'searchDatabase',
                    result: {
                        results: [{ videoId: 'v1' }, { videoId: 'v2' }],
                    },
                })],
                videoIds: ['v1', 'v2'],
            });

            expect(getGroupLabel(group)).toBe('2 search results');
        });
    });

    // -----------------------------------------------------------------------
    // isExpandable
    // -----------------------------------------------------------------------

    describe('isExpandable', () => {
        it('returns true when searchDatabase is resolved', () => {
            const group = makeGroup({
                toolName: 'searchDatabase',
                allResolved: true,
                videoIds: ['v1'],
            });

            expect(isExpandable(group)).toBe(true);
        });

        it('returns false when searchDatabase is not resolved', () => {
            const group = makeGroup({
                toolName: 'searchDatabase',
                allResolved: false,
                videoIds: [],
            });

            expect(isExpandable(group)).toBe(false);
        });

        it('returns true when searchDatabase is resolved even with no videoIds', () => {
            // searchDatabase has its own stats component, so should be expandable
            const group = makeGroup({
                toolName: 'searchDatabase',
                allResolved: true,
                videoIds: [],
            });

            expect(isExpandable(group)).toBe(true);
        });
    });
});

// =========================================================================
// separatePills — editKnowledge gets one pill per call
// =========================================================================

describe('toolCallGrouping — separatePills', () => {
    describe('groupToolCalls', () => {
        it('creates separate groups for editKnowledge calls', () => {
            const records = [
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki1' }, result: { title: 'Doc A' } }),
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki2' }, result: { error: 'anchor not found' } }),
            ];

            const groups = groupToolCalls(records);
            const editGroups = groups.filter(g => g.toolName === 'editKnowledge');

            expect(editGroups).toHaveLength(2);
            expect(editGroups[0].records).toHaveLength(1);
            expect(editGroups[1].records).toHaveLength(1);
        });

        it('computes allResolved and hasErrors independently per pill', () => {
            const records = [
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki1' }, result: { title: 'Doc A' } }),
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki2' }, result: { error: 'anchor not found' } }),
            ];

            const groups = groupToolCalls(records);
            const editGroups = groups.filter(g => g.toolName === 'editKnowledge');

            expect(editGroups[0].allResolved).toBe(true);
            expect(editGroups[0].hasErrors).toBe(false);
            expect(editGroups[1].allResolved).toBe(true);
            expect(editGroups[1].hasErrors).toBe(true);
        });

        it('marks preparing correctly for unresolved editKnowledge call', () => {
            const records = [
                { ...makeRecord({ name: 'editKnowledge', args: { kiId: 'ki1' } }), preparing: true } as ToolCallRecord & { preparing: boolean },
            ];

            const groups = groupToolCalls(records);
            const editGroup = groups.find(g => g.toolName === 'editKnowledge')!;

            expect(editGroup.preparing).toBe(true);
            expect(editGroup.allResolved).toBe(false);
        });

        it('mixes separatePills and grouped tools correctly', () => {
            const records = [
                makeRecord({ name: 'mentionVideo', args: { videoId: 'v1' }, result: { found: true } }),
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki1' }, result: { title: 'Doc A' } }),
                makeRecord({ name: 'mentionVideo', args: { videoId: 'v2' }, result: { found: true } }),
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki2' }, result: { error: 'not found' } }),
            ];

            const groups = groupToolCalls(records);

            const mentionGroups = groups.filter(g => g.toolName === 'mentionVideo');
            expect(mentionGroups).toHaveLength(1);
            expect(mentionGroups[0].records).toHaveLength(2);

            const editGroups = groups.filter(g => g.toolName === 'editKnowledge');
            expect(editGroups).toHaveLength(2);
        });

        it('handles all tool calls being separatePills', () => {
            const records = [
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki1' }, result: { title: 'A' } }),
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki2' }, result: { title: 'B' } }),
                makeRecord({ name: 'editKnowledge', args: { kiId: 'ki3' }, result: { title: 'C' } }),
            ];

            const groups = groupToolCalls(records);
            expect(groups).toHaveLength(3);
            expect(groups.every(g => g.toolName === 'editKnowledge')).toBe(true);
            expect(groups.every(g => g.records.length === 1)).toBe(true);
        });
    });

    describe('getGroupLabel', () => {
        it('returns title for successful editKnowledge', () => {
            const group = makeGroup({
                toolName: 'editKnowledge',
                allResolved: true,
                records: [makeRecord({
                    name: 'editKnowledge',
                    result: { title: 'Clone Tracker' },
                })],
            });

            expect(getGroupLabel(group)).toBe('Edited: "Clone Tracker"');
        });

        it('returns error label for failed editKnowledge', () => {
            const group = makeGroup({
                toolName: 'editKnowledge',
                hasErrors: true,
                allResolved: true,
                records: [makeRecord({
                    name: 'editKnowledge',
                    result: { error: 'anchor not found' },
                })],
            });

            expect(getGroupLabel(group)).toBe("Couldn't edit knowledge");
        });

        it('returns loading label for pending editKnowledge', () => {
            const group = makeGroup({
                toolName: 'editKnowledge',
                allResolved: false,
                records: [makeRecord({
                    name: 'editKnowledge',
                    result: undefined,
                })],
            });

            expect(getGroupLabel(group)).toBe('Editing knowledge...');
        });
    });

    describe('isExpandable', () => {
        it('returns true for resolved editKnowledge (has RecordComponent)', () => {
            const group = makeGroup({
                toolName: 'editKnowledge',
                allResolved: true,
            });

            expect(isExpandable(group)).toBe(true);
        });

        it('returns false for unresolved editKnowledge', () => {
            const group = makeGroup({
                toolName: 'editKnowledge',
                allResolved: false,
            });

            expect(isExpandable(group)).toBe(false);
        });
    });
});
