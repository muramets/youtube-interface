// =============================================================================
// aiChat — conclude/memorize integration tests
//
// Verifies: saveMemory is always in TOOL_DECLARATIONS, tool list is stable
// regardless of isConclude flag (critical for prompt cache stability).
// =============================================================================

import { describe, it, expect } from "vitest";
import { TOOL_DECLARATIONS, CONCLUDE_TOOL_DECLARATIONS } from "../../services/tools/definitions.js";

describe("Tool list stability (prompt cache)", () => {
    it("TOOL_DECLARATIONS includes saveMemory", () => {
        const names = TOOL_DECLARATIONS.map(t => t.name);
        expect(names).toContain("saveMemory");
    });

    it("CONCLUDE_TOOL_DECLARATIONS is empty (deprecated)", () => {
        expect(CONCLUDE_TOOL_DECLARATIONS).toHaveLength(0);
    });

    it("TOOL_DECLARATIONS includes all KI tools", () => {
        const names = TOOL_DECLARATIONS.map(t => t.name);
        expect(names).toContain("saveKnowledge");
        expect(names).toContain("editKnowledge");
        expect(names).toContain("listKnowledge");
        expect(names).toContain("getKnowledge");
    });

    it("tool list is the same regardless of isConclude", () => {
        // This is the critical test: the tool list must never change between
        // normal and conclude calls, otherwise BP2 cache breakpoint invalidates.
        const normalTools = TOOL_DECLARATIONS;
        const concludeTools = [...TOOL_DECLARATIONS, ...CONCLUDE_TOOL_DECLARATIONS];

        expect(concludeTools).toEqual(normalTools);
    });

    it("saveMemory tool description does not mention conclude-only", () => {
        const saveMemoryTool = TOOL_DECLARATIONS.find(t => t.name === "saveMemory");
        expect(saveMemoryTool).toBeDefined();
        expect(saveMemoryTool!.description.toLowerCase()).not.toContain("only available during memorize");
        expect(saveMemoryTool!.description.toLowerCase()).not.toContain("conclude-only");
    });
});

// NOTE: KI content stripping was removed — toolCalls are persisted as-is.
// Previously, saveKnowledge/editKnowledge args.content was replaced with
// "[Saved as KI {id}]" placeholders, causing Claude to misinterpret them.
// The integration test in aiChat.serverPersist.test.ts verifies full content
// passes through the Firestore write path.
