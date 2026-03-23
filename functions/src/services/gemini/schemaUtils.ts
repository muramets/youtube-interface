// =============================================================================
// Gemini Schema Utils — Convert standard JSON Schema to Gemini format
//
// Gemini SDK expects uppercase type strings ("OBJECT", "STRING", etc.)
// while standard JSON Schema uses lowercase ("object", "string", etc.).
// This module provides recursive conversion.
// =============================================================================

/** Map of standard JSON Schema type → Gemini uppercase type. */
const TYPE_MAP: Record<string, string> = {
    object: "OBJECT",
    string: "STRING",
    array: "ARRAY",
    boolean: "BOOLEAN",
    number: "NUMBER",
    integer: "INTEGER",
};

/**
 * Recursively convert a standard JSON Schema object to Gemini's schema format.
 * - Lowercases type strings → uppercase (e.g. "object" → "OBJECT")
 * - Preserves properties, items, required fields
 * - Unknown types are left as-is (defensive)
 */
export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(schema)) {
        if (key === "type" && typeof value === "string") {
            result.type = TYPE_MAP[value] ?? value;
        } else if (key === "properties" && typeof value === "object" && value !== null) {
            const props: Record<string, unknown> = {};
            for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
                if (typeof propSchema === "object" && propSchema !== null) {
                    props[propName] = toGeminiSchema(propSchema as Record<string, unknown>);
                } else {
                    props[propName] = propSchema;
                }
            }
            result.properties = props;
        } else if (key === "items" && typeof value === "object" && value !== null) {
            result.items = toGeminiSchema(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }

    return result;
}
