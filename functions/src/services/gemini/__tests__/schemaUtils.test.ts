import { describe, it, expect } from "vitest";
import { toGeminiSchema } from "../schemaUtils.js";

describe("toGeminiSchema", () => {
    it("converts simple object with string/number/boolean properties", () => {
        const input = {
            type: "object",
            properties: {
                name: { type: "string" },
                age: { type: "number" },
                active: { type: "boolean" },
            },
            required: ["name"],
        };

        const result = toGeminiSchema(input);

        expect(result).toEqual({
            type: "OBJECT",
            properties: {
                name: { type: "STRING" },
                age: { type: "NUMBER" },
                active: { type: "BOOLEAN" },
            },
            required: ["name"],
        });
    });

    it("handles nested objects recursively", () => {
        const input = {
            type: "object",
            properties: {
                meta: {
                    type: "object",
                    properties: {
                        label: { type: "string" },
                    },
                },
            },
        };

        const result = toGeminiSchema(input);

        expect(result).toEqual({
            type: "OBJECT",
            properties: {
                meta: {
                    type: "OBJECT",
                    properties: {
                        label: { type: "STRING" },
                    },
                },
            },
        });
    });

    it("handles arrays with items", () => {
        const input = {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                },
                required: ["title"],
            },
        };

        const result = toGeminiSchema(input);

        expect(result).toEqual({
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                },
                required: ["title"],
            },
        });
    });

    it("preserves required fields unchanged", () => {
        const input = {
            type: "object",
            properties: { a: { type: "string" } },
            required: ["a"],
        };

        const result = toGeminiSchema(input);
        expect(result.required).toEqual(["a"]);
    });

    it("converts integer type", () => {
        const input = { type: "integer" };
        expect(toGeminiSchema(input)).toEqual({ type: "INTEGER" });
    });

    it("leaves unknown types as-is", () => {
        const input = { type: "custom-type" };
        expect(toGeminiSchema(input)).toEqual({ type: "custom-type" });
    });

    it("handles the full consolidation schema shape", () => {
        const input = {
            type: "object",
            properties: {
                memories: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            content: { type: "string" },
                        },
                        required: ["title", "content"],
                    },
                },
                reasoning: { type: "string" },
                noChangesNeeded: { type: "boolean" },
            },
            required: ["memories", "reasoning", "noChangesNeeded"],
        };

        const result = toGeminiSchema(input);

        expect(result.type).toBe("OBJECT");
        const memories = (result.properties as Record<string, Record<string, unknown>>).memories;
        expect(memories.type).toBe("ARRAY");
        const items = memories.items as Record<string, unknown>;
        expect(items.type).toBe("OBJECT");
    });
});
