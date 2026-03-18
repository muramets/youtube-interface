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
