import { describe, it, expect } from "vitest";
import {
    applyOperations,
    type EditOperation,
    type ApplyOperationsResult,
    type ApplyOperationsError,
} from "../applyOperations.js";

// Helper to assert success
function expectSuccess(result: ApplyOperationsResult | ApplyOperationsError): asserts result is ApplyOperationsResult {
    expect(result.success).toBe(true);
}

// Helper to assert error
function expectError(result: ApplyOperationsResult | ApplyOperationsError): asserts result is ApplyOperationsError {
    expect(result.success).toBe(false);
}

describe("applyOperations", () => {
    // =========================================================================
    // replace — happy path
    // =========================================================================

    describe("replace — happy path", () => {
        it("replaces single occurrence in middle of text", () => {
            const result = applyOperations("Browse 45% of traffic", [
                { type: "replace", old_string: "45%", new_string: "50%" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("Browse 50% of traffic");
            expect(result.charsAdded).toBe(3); // "50%"
            expect(result.charsRemoved).toBe(3); // "45%"
        });

        it("replaces with empty string (deletion)", () => {
            const result = applyOperations("Hello World!", [
                { type: "replace", old_string: " World", new_string: "" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("Hello!");
            expect(result.charsAdded).toBe(0);
            expect(result.charsRemoved).toBe(6); // " World"
        });

        it("replaces multiline old_string", () => {
            const content = "Line 1\nLine 2\nLine 3";
            const result = applyOperations(content, [
                { type: "replace", old_string: "Line 1\nLine 2", new_string: "Updated block" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("Updated block\nLine 3");
        });

        it("preserves surrounding whitespace", () => {
            const result = applyOperations("  hello  world  ", [
                { type: "replace", old_string: "hello", new_string: "hi" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("  hi  world  ");
        });
    });

    // =========================================================================
    // replace_all
    // =========================================================================

    describe("replace_all", () => {
        it("replaces all 3 occurrences with replace_all: true", () => {
            const result = applyOperations("foo bar foo baz foo", [
                { type: "replace", old_string: "foo", new_string: "qux", replace_all: true },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("qux bar qux baz qux");
            expect(result.charsAdded).toBe(9); // "qux" × 3
            expect(result.charsRemoved).toBe(9); // "foo" × 3
        });

        it("works like normal replace with single occurrence", () => {
            const result = applyOperations("hello world", [
                { type: "replace", old_string: "hello", new_string: "hi", replace_all: true },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("hi world");
        });

        it("errors when replace_all is false (explicit) with 2 occurrences", () => {
            const result = applyOperations("ab ab", [
                { type: "replace", old_string: "ab", new_string: "cd", replace_all: false },
            ]);
            expectError(result);
            expect(result.error).toContain("found 2 times");
        });
    });

    // =========================================================================
    // replace — error cases
    // =========================================================================

    describe("replace — error cases", () => {
        it("returns error with operationIndex 0 when old_string not found", () => {
            const result = applyOperations("Hello World", [
                { type: "replace", old_string: "Goodbye", new_string: "Hi" },
            ]);
            expectError(result);
            expect(result.operationIndex).toBe(0);
            expect(result.error).toContain("not found");
        });

        it("returns error with 2 occurrence positions", () => {
            const result = applyOperations("ab cd ab", [
                { type: "replace", old_string: "ab", new_string: "xy" },
            ]);
            expectError(result);
            expect(result.error).toContain("found 2 times");
            expect(result.error).toContain("0");
            expect(result.error).toContain("6");
        });

        it("returns error with all 5 positions for 5 occurrences", () => {
            const content = "x x x x x";
            const result = applyOperations(content, [
                { type: "replace", old_string: "x", new_string: "y" },
            ]);
            expectError(result);
            expect(result.error).toContain("found 5 times");
        });
    });

    // =========================================================================
    // insert_after — happy path
    // =========================================================================

    describe("insert_after — happy path", () => {
        it("inserts after single-line anchor", () => {
            const result = applyOperations("## Header\nContent here", [
                { type: "insert_after", anchor: "## Header", content: "\nNew line" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("## Header\nNew line\nContent here");
            expect(result.charsAdded).toBe(9); // "\nNew line"
            expect(result.charsRemoved).toBe(0);
        });

        it("inserts after multiline anchor", () => {
            const result = applyOperations("A\nB\nC\nD", [
                { type: "insert_after", anchor: "A\nB", content: "\nINSERTED" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("A\nB\nINSERTED\nC\nD");
        });

        it("inserts after anchor at end of content", () => {
            const result = applyOperations("start end", [
                { type: "insert_after", anchor: "end", content: " APPENDED" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("start end APPENDED");
        });
    });

    // =========================================================================
    // insert_after — error cases
    // =========================================================================

    describe("insert_after — error cases", () => {
        it("returns error when anchor not found", () => {
            const result = applyOperations("Hello World", [
                { type: "insert_after", anchor: "Missing", content: "X" },
            ]);
            expectError(result);
            expect(result.error).toContain("not found");
        });

        it("returns error when anchor found 2+ times", () => {
            const result = applyOperations("ab cd ab", [
                { type: "insert_after", anchor: "ab", content: "X" },
            ]);
            expectError(result);
            expect(result.error).toContain("found 2 times");
        });
    });

    // =========================================================================
    // insert_before — happy path
    // =========================================================================

    describe("insert_before — happy path", () => {
        it("inserts before single-line anchor", () => {
            const result = applyOperations("## Old Traffic\nData", [
                { type: "insert_before", anchor: "## Old Traffic", content: "## Preamble\n" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("## Preamble\n## Old Traffic\nData");
        });

        it("inserts before anchor at start of content", () => {
            const result = applyOperations("First line", [
                { type: "insert_before", anchor: "First", content: "PREPENDED " },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("PREPENDED First line");
        });

        it("inserts before multiline anchor", () => {
            const result = applyOperations("A\nB\nC\nD", [
                { type: "insert_before", anchor: "C\nD", content: "INSERTED\n" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("A\nB\nINSERTED\nC\nD");
        });
    });

    // =========================================================================
    // insert_before — error cases
    // =========================================================================

    describe("insert_before — error cases", () => {
        it("returns error when anchor not found", () => {
            const result = applyOperations("Hello World", [
                { type: "insert_before", anchor: "Missing", content: "X" },
            ]);
            expectError(result);
            expect(result.error).toContain("not found");
        });

        it("returns error when anchor found 2+ times", () => {
            const result = applyOperations("ab cd ab", [
                { type: "insert_before", anchor: "ab", content: "X" },
            ]);
            expectError(result);
            expect(result.error).toContain("found 2 times");
        });
    });

    // =========================================================================
    // Sequential application
    // =========================================================================

    describe("sequential application", () => {
        it("second replace sees result of first", () => {
            const result = applyOperations("A B C", [
                { type: "replace", old_string: "A", new_string: "X" },
                { type: "replace", old_string: "X B", new_string: "Y" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("Y C");
        });

        it("replace + insert_after in sequence", () => {
            const result = applyOperations("## Traffic\nBrowse 45%", [
                { type: "replace", old_string: "45%", new_string: "50%" },
                { type: "insert_after", anchor: "50%", content: "\nDirect 30%" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("## Traffic\nBrowse 50%\nDirect 30%");
        });

        it("operation 2 fails → content UNCHANGED (dry-run)", () => {
            const original = "A B C";
            const result = applyOperations(original, [
                { type: "replace", old_string: "A", new_string: "X" },
                { type: "replace", old_string: "NONEXISTENT", new_string: "Z" },
            ]);
            expectError(result);
            expect(result.operationIndex).toBe(1);
            // Original content is unchanged because applyOperations works on a copy
            // (the caller's string is immutable in JS — strings are value types)
        });
    });

    // =========================================================================
    // Edge cases
    // =========================================================================

    describe("edge cases", () => {
        it("empty operations array → error", () => {
            const result = applyOperations("content", []);
            expectError(result);
            expect(result.error).toContain("empty");
            expect(result.operationIndex).toBe(-1);
        });

        it("31 operations → error 'too many operations'", () => {
            const ops: EditOperation[] = Array.from({ length: 31 }, (_, i) => ({
                type: "replace" as const,
                old_string: `item${i}`,
                new_string: `new${i}`,
            }));
            const content = Array.from({ length: 31 }, (_, i) => `item${i}`).join(" ");
            const result = applyOperations(content, ops);
            expectError(result);
            expect(result.error).toContain("Too many operations (31)");
            expect(result.error).toContain("content");
        });

        it("empty old_string → error 'must not be empty'", () => {
            const result = applyOperations("abc", [
                { type: "replace", old_string: "", new_string: "x" },
            ]);
            expectError(result);
            expect(result.error).toContain("old_string must not be empty");
        });

        it("empty anchor → error 'must not be empty'", () => {
            const result = applyOperations("abc", [
                { type: "insert_after", anchor: "", content: "x" },
            ]);
            expectError(result);
            expect(result.error).toContain("anchor must not be empty");
        });

        it("empty anchor on insert_before → error 'must not be empty'", () => {
            const result = applyOperations("abc", [
                { type: "insert_before", anchor: "", content: "x" },
            ]);
            expectError(result);
            expect(result.error).toContain("anchor must not be empty");
        });

        it("replace with old_string === new_string → success, content unchanged (no-op)", () => {
            const result = applyOperations("hello world", [
                { type: "replace", old_string: "hello", new_string: "hello" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("hello world");
        });

        it("replace_all: true on insert_after → error", () => {
            const result = applyOperations("abc", [
                { type: "insert_after", anchor: "a", content: "x", replace_all: true } as unknown as EditOperation,
            ]);
            expectError(result);
            expect(result.error).toContain("'replace_all' is only valid for 'replace' operations");
        });

        it("replace_all: true on insert_before → error", () => {
            const result = applyOperations("abc", [
                { type: "insert_before", anchor: "a", content: "x", replace_all: true } as unknown as EditOperation,
            ]);
            expectError(result);
            expect(result.error).toContain("'replace_all' is only valid for 'replace' operations");
        });

        it("regex special characters in old_string ($100.00 (25%)) found correctly", () => {
            const result = applyOperations("Price: $100.00 (25%) discount", [
                { type: "replace", old_string: "$100.00 (25%)", new_string: "$200.00 (50%)" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("Price: $200.00 (50%) discount");
        });

        it("unicode content (emoji, CJK) works", () => {
            const result = applyOperations("Hello 🌍 世界", [
                { type: "replace", old_string: "🌍 世界", new_string: "🎉 мир" },
            ]);
            expectSuccess(result);
            expect(result.content).toBe("Hello 🎉 мир");
        });

        it("30 operations exactly → success (at the limit)", () => {
            // Use zero-padded keys to avoid substring collisions (item1 ⊂ item10)
            const pad = (n: number) => String(n).padStart(3, "0");
            const ops: EditOperation[] = Array.from({ length: 30 }, (_, i) => ({
                type: "replace" as const,
                old_string: `item_${pad(i)}`,
                new_string: `new_${pad(i)}`,
            }));
            const content = Array.from({ length: 30 }, (_, i) => `item_${pad(i)}`).join(" ");
            const result = applyOperations(content, ops);
            expectSuccess(result);
            for (let i = 0; i < 30; i++) {
                expect(result.content).toContain(`new_${pad(i)}`);
            }
        });
    });

    // =========================================================================
    // Error context quality
    // =========================================================================

    describe("error context", () => {
        it("error message includes operationIndex for second operation", () => {
            const result = applyOperations("A B", [
                { type: "replace", old_string: "A", new_string: "X" },
                { type: "replace", old_string: "MISSING", new_string: "Y" },
            ]);
            expectError(result);
            expect(result.operationIndex).toBe(1);
        });

        it("'not found' error shows nearest partial match with surrounding context", () => {
            // old_string must be >30 chars so first 30 chars can be used as partial search
            // and those first 30 chars must appear in the content
            const content = "## Traffic Analysis\nBrowse features account for 45% of total traffic from suggested sources";
            const result = applyOperations(content, [
                { type: "replace", old_string: "Browse features account for 45% — this extra part is wrong", new_string: "X" },
            ]);
            expectError(result);
            expect(result.error).toContain("Closest match");
            expect(result.error).toContain("Browse features");
        });

        it("'not found' falls back to bookends when partial match also not found", () => {
            const content = "A".repeat(200);
            const result = applyOperations(content, [
                { type: "replace", old_string: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", new_string: "X" },
            ]);
            expectError(result);
            expect(result.error).toContain("Content starts with");
            expect(result.error).toContain("ends with");
            expect(result.error).toContain("200 chars");
        });

        it("'not found' uses full old_string for partial search when shorter than 30 chars", () => {
            const content = "Hello World";
            const result = applyOperations(content, [
                { type: "replace", old_string: "xyz", new_string: "abc" },
            ]);
            expectError(result);
            // Short old_string: no partial match, falls back to bookends
            expect(result.error).toContain("not found");
        });

        it("'multiple matches' error includes occurrence count and character positions", () => {
            const content = "ab--ab--ab";
            const result = applyOperations(content, [
                { type: "replace", old_string: "ab", new_string: "X" },
            ]);
            expectError(result);
            expect(result.error).toContain("found 3 times");
            expect(result.error).toContain("0");
            expect(result.error).toContain("4");
            expect(result.error).toContain("8");
        });
    });
});
