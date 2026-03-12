// =============================================================================
// AI Provider Types — Single source of truth for multi-provider abstraction
//
// Provider-agnostic interfaces that define the contract between the chat
// system and any AI provider (Gemini, Claude, OpenAI, etc.).
//
// Dependency direction: ai/ ← gemini/, ai/ ← claude/, etc.
// This file must NOT import from any provider-specific module.
// =============================================================================

import type { ToolContext } from "../tools/types.js";
import type { NormalizedTokenUsage } from "../../shared/models.js";

// --- Core provider interface (Strategy Pattern) ---

/**
 * AI provider — each implementation owns its agentic loop,
 * streaming, and provider-specific message formatting.
 */
export interface AiProvider {
    streamChat(opts: ProviderStreamOpts): Promise<StreamResult>;
}

// --- Input options ---

/** Provider-agnostic options for a streaming chat call. */
export interface ProviderStreamOpts {
    /** Model identifier (e.g. 'gemini-2.5-pro', 'claude-opus-4'). */
    model: string;
    /** System-level instructions prepended to the conversation. */
    systemPrompt?: string;
    /** Conversation history (oldest first). */
    history: HistoryMessage[];
    /** Current user message text. */
    text: string;
    /** File attachments on the current message. */
    attachments?: AttachmentRef[];
    /** Thumbnail URLs for vision (provider uploads/inlines as needed). */
    imageUrls?: string[];
    /** Available tool definitions for function calling. */
    tools: ToolDefinition[];
    /** Context for tool execution (userId, channelId, reportProgress). */
    toolContext?: ToolContext;
    /** Thinking depth option id (must match the model's thinkingOptions). */
    thinkingOptionId?: string;
    /** Streaming and progress callbacks. */
    callbacks: StreamCallbacks;
    /** AbortSignal for caller-initiated cancellation. */
    signal?: AbortSignal;
    /**
     * Provider-specific context bag — typed at call-site via per-provider
     * helper functions (e.g. geminiContext(), claudeContext()).
     * Providers cast this back to their typed interface internally.
     */
    providerContext?: Record<string, unknown>;
}

// --- Messages ---

/** A single message in the conversation history. */
export interface HistoryMessage {
    /** Firestore document ID of the message. */
    id: string;
    /** Message author: 'user' or 'model' (AI assistant). */
    role: "user" | "model";
    /** Plain text content of the message. */
    text: string;
    /** File attachments on this message. */
    attachments?: AttachmentRef[];
    /**
     * Per-message context items attached by the user (Layer 2).
     * Each item has `type` ('video-card' | 'suggested-traffic' | 'canvas-selection')
     * plus type-specific fields.
     * Untyped on server because CF cannot import client-side AppContextItem types.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appContext?: any[];
    /** Tool calls executed during this message's agentic loop (model messages only). */
    toolCalls?: ToolCallRecord[];
}

// --- Attachments ---

/**
 * Provider-agnostic file attachment reference.
 * NO provider-specific fields — each provider converts to its native format.
 */
export interface AttachmentRef {
    /** Media category of the attachment. */
    type: "image" | "audio" | "video" | "file";
    /** Firebase Storage URL (universal source of truth). */
    url: string;
    /** MIME type (e.g. 'image/jpeg', 'audio/mp3'). */
    mimeType: string;
    /** Human-readable file name. */
    name: string;
    /** Image width in pixels (captured at upload time for token estimation). */
    width?: number;
    /** Image height in pixels (captured at upload time for token estimation). */
    height?: number;
}

// --- Tool definitions ---

/**
 * Provider-agnostic tool definition using JSON Schema for parameters.
 * Each provider converts this to its native format (e.g. FunctionDeclaration for Gemini).
 */
export interface ToolDefinition {
    /** Tool name used for routing to the handler. */
    name: string;
    /** Human-readable description of what the tool does (used by the model). */
    description: string;
    /** JSON Schema object describing the tool's parameters. */
    parametersJsonSchema: Record<string, unknown>;
}

// --- Callbacks ---

/** Streaming and progress callbacks for real-time UI updates. */
export interface StreamCallbacks {
    /** Called on each text chunk with the full accumulated text so far. */
    onChunk: (fullText: string) => void;
    /** Called when the model initiates a tool call (before execution). */
    onToolCall?: (name: string, args: Record<string, unknown>, index: number) => void;
    /** Called after a tool finishes executing with its result. */
    onToolResult?: (name: string, result: Record<string, unknown>, index: number) => void;
    /** Called during tool execution to report intermediate progress steps. */
    onToolProgress?: (toolName: string, message: string, index: number) => void;
    /** Called when the model emits thinking/reasoning tokens. */
    onThought?: (text: string) => void;
    /** Called when a transient error triggers automatic retry. */
    onRetry?: (attempt: number) => void;
}

// --- Result ---

/** Result of a streaming chat call. */
export interface StreamResult {
    /** Final accumulated text response. */
    text: string;
    /** Token usage statistics (if provided by the provider). */
    tokenUsage?: TokenUsage;
    /** Provider-agnostic normalized token usage (per-iteration cost, context window). */
    normalizedUsage?: NormalizedTokenUsage;
    /** Tool calls executed during the agentic loop. */
    toolCalls?: ToolCallRecord[];
    /**
     * Provider-specific metadata (e.g. updatedThumbnailCache for Gemini).
     * Typed at consumption site via per-provider helpers.
     */
    providerMeta?: Record<string, unknown>;
    /** Images injected during the agentic loop (from tool responses like viewThumbnails). */
    agenticImages?: { count: number; tokens: number };
    /** True when the stream was aborted by the caller — usage is partial. */
    partial?: boolean;
}

// --- Token usage ---

/** Token usage statistics reported by any AI provider. */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Tokens served from the provider's context cache (if applicable). */
    cachedTokens?: number;
    /** Tokens used to create a new cache entry (if applicable). */
    cacheWriteTokens?: number;
}

// --- Tool call records ---

/**
 * Record of a tool call executed during the agentic loop.
 * MIRROR: src/core/types/sseEvents.ts:ToolCallRecord — keep in sync.
 */
export interface ToolCallRecord {
    name: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
}

// --- Factory ---

/**
 * Factory function that creates an AiProvider instance from configuration.
 * Used by the provider router for lazy initialization.
 */
export type ProviderFactory = (config: Record<string, unknown>) => AiProvider;
