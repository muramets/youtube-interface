// =============================================================================
// Tools — barrel export
// =============================================================================

// Definitions (for Gemini API config)
export { TOOL_DECLARATIONS, TOOL_NAMES, type ToolName } from "./definitions.js";

// Executor (for agentic loop)
export { executeTool } from "./executor.js";

// Types (for consumers)
export type { ToolContext, FunctionCallInput, FunctionCallResult, ToolHandler } from "./types.js";
