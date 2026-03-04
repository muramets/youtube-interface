// =============================================================================
// Gemini Tool Adapter — Convert provider-agnostic ToolDefinition to
// Gemini's FunctionDeclaration format.
//
// The conversion is straightforward because both formats use JSON Schema
// for parameter definitions. FunctionDeclaration uses `parametersJsonSchema`
// as the property name — which matches our ToolDefinition exactly.
// =============================================================================

import type { FunctionDeclaration } from "@google/genai";
import type { ToolDefinition } from "../ai/types.js";

/**
 * Convert an array of provider-agnostic ToolDefinitions to
 * Gemini FunctionDeclaration format.
 *
 * Each ToolDefinition maps 1:1 to a FunctionDeclaration:
 *   - name → name
 *   - description → description
 *   - parametersJsonSchema → parametersJsonSchema
 */
export function toFunctionDeclarations(
    tools: ToolDefinition[],
): FunctionDeclaration[] {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parametersJsonSchema,
    }));
}
