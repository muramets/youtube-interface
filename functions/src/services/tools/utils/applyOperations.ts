// =============================================================================
// applyOperations — pure function for patch-based content editing
//
// Applies sequential edit operations (replace, insert_after, insert_before)
// to a content string. All-or-nothing: if any operation fails, none are applied.
// Zero dependencies — testable without mocks.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplaceOperation {
    type: "replace";
    old_string: string;
    new_string: string;
    replace_all?: boolean;
}

export interface InsertAfterOperation {
    type: "insert_after";
    anchor: string;
    content: string;
}

export interface InsertBeforeOperation {
    type: "insert_before";
    anchor: string;
    content: string;
}

export type EditOperation = ReplaceOperation | InsertAfterOperation | InsertBeforeOperation;

export interface ApplyOperationsResult {
    success: true;
    content: string;
    charsAdded: number;
    charsRemoved: number;
}

export interface ApplyOperationsError {
    success: false;
    error: string;
    operationIndex: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_OPERATIONS = 30;
const PARTIAL_MATCH_PREFIX_LENGTH = 30;
const CONTEXT_WINDOW = 200;
const BOOKEND_LENGTH = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all occurrence positions of `needle` in `haystack` via indexOf loop. */
function findAllPositions(haystack: string, needle: string): number[] {
    const positions: number[] = [];
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
        positions.push(idx);
        idx = haystack.indexOf(needle, idx + 1);
    }
    return positions;
}

/** Build a "not found" error with nearest partial match context. */
function buildNotFoundError(
    content: string,
    searchString: string,
    label: string,
    operationIndex: number,
): string {
    const prefix = searchString.slice(0, PARTIAL_MATCH_PREFIX_LENGTH);
    const partialIdx = content.indexOf(prefix);

    if (partialIdx !== -1) {
        const start = Math.max(0, partialIdx - CONTEXT_WINDOW);
        const end = Math.min(content.length, partialIdx + prefix.length + CONTEXT_WINDOW);
        const snippet = content.slice(start, end);
        return `Operation ${operationIndex}: ${label} not found. Closest match at position ${partialIdx}: '...${snippet}...' — your ${label}: '${searchString.slice(0, 80)}'`;
    }

    // Fallback: bookends (first 100 + last 100 + total length)
    const head = content.slice(0, BOOKEND_LENGTH);
    const tail = content.slice(-BOOKEND_LENGTH);
    return `Operation ${operationIndex}: ${label} not found in content (${content.length} chars). Content starts with: '${head}...' and ends with: '...${tail}'`;
}

/** Build a "multiple matches" error with occurrence count and positions. */
function buildMultipleMatchesError(
    positions: number[],
    label: string,
    operationIndex: number,
): string {
    const posStr = positions.join(", ");
    return `Operation ${operationIndex}: ${label} found ${positions.length} times at character positions [${posStr}] — provide more surrounding context to disambiguate, or use replace_all: true for replace operations`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function applyOperations(
    content: string,
    operations: EditOperation[],
): ApplyOperationsResult | ApplyOperationsError {
    // Validate operations array
    if (!operations || operations.length === 0) {
        return {
            success: false,
            error: "operations array is empty — provide at least one operation",
            operationIndex: -1,
        };
    }

    if (operations.length > MAX_OPERATIONS) {
        return {
            success: false,
            error: `Too many operations (${operations.length}). Maximum is ${MAX_OPERATIONS} — use 'content' for full rewrites`,
            operationIndex: -1,
        };
    }

    // Dry-run: work on a copy
    let result = content;
    let charsAdded = 0;
    let charsRemoved = 0;

    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];

        // Validate replace_all on non-replace operations
        if (op.type !== "replace" && "replace_all" in op) {
            return {
                success: false,
                error: "'replace_all' is only valid for 'replace' operations",
                operationIndex: i,
            };
        }

        if (op.type === "replace") {
            // Empty string guard
            if (op.old_string === "") {
                return {
                    success: false,
                    error: "old_string must not be empty",
                    operationIndex: i,
                };
            }

            const positions = findAllPositions(result, op.old_string);

            if (positions.length === 0) {
                return {
                    success: false,
                    error: buildNotFoundError(result, op.old_string, "old_string", i),
                    operationIndex: i,
                };
            }

            if (positions.length > 1 && !op.replace_all) {
                return {
                    success: false,
                    error: buildMultipleMatchesError(positions, "old_string", i),
                    operationIndex: i,
                };
            }

            if (op.replace_all) {
                charsRemoved += op.old_string.length * positions.length;
                charsAdded += op.new_string.length * positions.length;
                result = result.split(op.old_string).join(op.new_string);
            } else {
                charsRemoved += op.old_string.length;
                charsAdded += op.new_string.length;
                // Single replacement at first occurrence
                result = result.slice(0, positions[0])
                    + op.new_string
                    + result.slice(positions[0] + op.old_string.length);
            }
        } else {
            // insert_after or insert_before
            const anchor = op.anchor;

            if (anchor === "") {
                return {
                    success: false,
                    error: "anchor must not be empty",
                    operationIndex: i,
                };
            }

            const positions = findAllPositions(result, anchor);

            if (positions.length === 0) {
                return {
                    success: false,
                    error: buildNotFoundError(result, anchor, "anchor", i),
                    operationIndex: i,
                };
            }

            if (positions.length > 1) {
                return {
                    success: false,
                    error: buildMultipleMatchesError(positions, "anchor", i),
                    operationIndex: i,
                };
            }

            charsAdded += op.content.length;

            if (op.type === "insert_after") {
                const insertPos = positions[0] + anchor.length;
                result = result.slice(0, insertPos) + op.content + result.slice(insertPos);
            } else {
                // insert_before
                result = result.slice(0, positions[0]) + op.content + result.slice(positions[0]);
            }
        }
    }

    return { success: true, content: result, charsAdded, charsRemoved };
}
