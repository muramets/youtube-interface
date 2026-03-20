// =============================================================================
// aiChat — conclude/memorize integration tests
//
// Verifies: isConclude tool injection and correct tool list composition.
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

// NOTE: KI content stripping was removed — toolCalls are persisted as-is.
// Previously, saveKnowledge/editKnowledge args.content was replaced with
// "[Saved as KI {id}]" placeholders, causing Claude to misinterpret them.
// The integration test in aiChat.serverPersist.test.ts verifies full content
// passes through the Firestore write path.
