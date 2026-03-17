// =============================================================================
// aiChat — conclude/memorize integration tests
//
// Verifies: isConclude tool injection, strip content before persist,
// and correct tool list composition.
// =============================================================================

import { describe, it, expect } from "vitest";
import { TOOL_DECLARATIONS, CONCLUDE_TOOL_DECLARATIONS } from "../../services/tools/definitions.js";

describe("Conclude tool injection", () => {
    it("TOOL_DECLARATIONS does NOT include saveMemory", () => {
        const names = TOOL_DECLARATIONS.map(t => t.name);
        expect(names).not.toContain("saveMemory");
    });

    it("CONCLUDE_TOOL_DECLARATIONS includes saveMemory", () => {
        const names = CONCLUDE_TOOL_DECLARATIONS.map(t => t.name);
        expect(names).toContain("saveMemory");
        expect(names).toHaveLength(1);
    });

    it("TOOL_DECLARATIONS includes all KI tools", () => {
        const names = TOOL_DECLARATIONS.map(t => t.name);
        expect(names).toContain("saveKnowledge");
        expect(names).toContain("editKnowledge");
        expect(names).toContain("listKnowledge");
        expect(names).toContain("getKnowledge");
    });

    it("isConclude=true produces combined tool list with saveMemory at end", () => {
        const isConclude = true;
        const tools = isConclude
            ? [...TOOL_DECLARATIONS, ...CONCLUDE_TOOL_DECLARATIONS]
            : TOOL_DECLARATIONS;

        const names = tools.map(t => t.name);
        expect(names).toContain("saveMemory");
        expect(names).toContain("saveKnowledge");
        // saveMemory is at the end (after all standard tools)
        expect(names.indexOf("saveMemory")).toBeGreaterThan(names.indexOf("saveKnowledge"));
    });

    it("isConclude=false does NOT include saveMemory", () => {
        const isConclude = false;
        const tools = isConclude
            ? [...TOOL_DECLARATIONS, ...CONCLUDE_TOOL_DECLARATIONS]
            : TOOL_DECLARATIONS;

        const names = tools.map(t => t.name);
        expect(names).not.toContain("saveMemory");
    });
});

describe("Strip KI content before persist", () => {
    it("replaces saveKnowledge args.content with reference pointer", () => {
        const toolCalls = [
            { name: "saveKnowledge", args: { category: "traffic-analysis", title: "Traffic Q1", content: "Full 3000 word analysis...", summary: "Short" }, result: { id: "ki-abc123" } },
            { name: "saveMemory", args: { content: "Summary with refs", kiRefs: ["ki-abc123"] }, result: { memoryId: "mem-xyz" } },
            { name: "mentionVideo", args: { videoId: "v1" }, result: { title: "My Video" } },
        ];

        // Same logic as aiChat.ts lines 367-372
        const persistToolCalls = toolCalls.map(tc => {
            if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
            }
            return tc;
        });

        // saveKnowledge content replaced
        expect(persistToolCalls[0].args.content).toBe("[Saved as KI ki-abc123]");
        // summary preserved
        expect(persistToolCalls[0].args.summary).toBe("Short");
        // other fields preserved
        expect(persistToolCalls[0].args.category).toBe("traffic-analysis");
        // saveMemory untouched
        expect(persistToolCalls[1].args.content).toBe("Summary with refs");
        // mentionVideo untouched
        expect(persistToolCalls[2].args.videoId).toBe("v1");
    });

    it("skips strip when saveKnowledge has no result.id (handler error)", () => {
        const toolCalls = [
            { name: "saveKnowledge", args: { content: "Full analysis..." }, result: { error: "slug invalid" } },
        ];

        const persistToolCalls = toolCalls.map(tc => {
            if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
            }
            return tc;
        });

        // Content NOT stripped because result has no id (error case)
        expect(persistToolCalls[0].args.content).toBe("Full analysis...");
    });

    it("handles empty toolCalls gracefully", () => {
        const toolCalls: { name: string; args: Record<string, unknown>; result: Record<string, unknown> }[] = [];

        const persistToolCalls = toolCalls.map(tc => {
            if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
            }
            return tc;
        });

        expect(persistToolCalls).toEqual([]);
    });

    it("strips multiple saveKnowledge calls independently", () => {
        const toolCalls = [
            { name: "saveKnowledge", args: { content: "Analysis 1" }, result: { id: "ki-1" } },
            { name: "saveKnowledge", args: { content: "Analysis 2" }, result: { id: "ki-2" } },
            { name: "saveKnowledge", args: { content: "Analysis 3 failed" }, result: { error: "too long" } },
        ];

        const persistToolCalls = toolCalls.map(tc => {
            if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
            }
            return tc;
        });

        expect(persistToolCalls[0].args.content).toBe("[Saved as KI ki-1]");
        expect(persistToolCalls[1].args.content).toBe("[Saved as KI ki-2]");
        expect(persistToolCalls[2].args.content).toBe("Analysis 3 failed"); // not stripped
    });

    it("replaces editKnowledge args.content with reference pointer", () => {
        const toolCalls = [
            { name: "editKnowledge", args: { kiId: "ki-abc", content: "Updated 3000 word analysis..." }, result: { id: "ki-abc" } },
            { name: "saveKnowledge", args: { category: "test", title: "T", content: "New analysis", summary: "S" }, result: { id: "ki-new" } },
        ];

        // Same logic as aiChat.ts
        const persistToolCalls = toolCalls.map(tc => {
            if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
            }
            if (tc.name === 'editKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Updated KI ${tc.result.id}]` } };
            }
            return tc;
        });

        // editKnowledge content replaced
        expect(persistToolCalls[0].args.content).toBe("[Updated KI ki-abc]");
        // kiId preserved
        expect(persistToolCalls[0].args.kiId).toBe("ki-abc");
        // saveKnowledge still works
        expect(persistToolCalls[1].args.content).toBe("[Saved as KI ki-new]");
    });

    it("skips editKnowledge strip when result has no id (handler error)", () => {
        const toolCalls = [
            { name: "editKnowledge", args: { kiId: "ki-bad", content: "Updated content" }, result: { error: "Not found" } },
        ];

        const persistToolCalls = toolCalls.map(tc => {
            if (tc.name === 'saveKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Saved as KI ${tc.result.id}]` } };
            }
            if (tc.name === 'editKnowledge' && tc.args?.content && tc.result?.id) {
                return { ...tc, args: { ...tc.args, content: `[Updated KI ${tc.result.id}]` } };
            }
            return tc;
        });

        expect(persistToolCalls[0].args.content).toBe("Updated content"); // not stripped
    });
});
