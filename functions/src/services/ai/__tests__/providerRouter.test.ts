// =============================================================================
// providerRouter — unit tests
//
// Verify that createProviderRouter correctly:
//   - resolves model IDs to providers via prefix/exact matching
//   - lazy-initializes provider instances (factory called once)
//   - reuses cached instances on subsequent calls
//   - throws descriptive errors for unknown models
//   - forwards streamChat options to the resolved provider
//
// No module mocks — uses inline mock factories for full isolation.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProviderRouter } from "../providerRouter.js";
import type {
    AiProvider,
    ProviderFactory,
    ProviderStreamOpts,
    StreamResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal ProviderStreamOpts for testing — only `model` and `callbacks` are used by the router. */
function makeStreamOpts(model: string): ProviderStreamOpts {
    return {
        model,
        history: [],
        text: "test message",
        tools: [],
        callbacks: { onChunk: vi.fn() },
    };
}

/** Create a mock AiProvider that returns a predictable StreamResult. */
function makeMockProvider(label: string): AiProvider {
    return {
        streamChat: vi.fn<(opts: ProviderStreamOpts) => Promise<StreamResult>>().mockResolvedValue({
            text: `response from ${label}`,
            tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        }),
    };
}

/** Create a mock ProviderFactory that tracks calls and returns a fixed provider. */
function makeMockFactory(label: string): {
    factory: ProviderFactory;
    provider: AiProvider;
    factoryFn: ReturnType<typeof vi.fn>;
} {
    const provider = makeMockProvider(label);
    const factoryFn = vi.fn<ProviderFactory>().mockReturnValue(provider);
    return { factory: factoryFn, provider, factoryFn };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let geminiFactory: ReturnType<typeof makeMockFactory>;
let anthropicFactory: ReturnType<typeof makeMockFactory>;

beforeEach(() => {
    vi.clearAllMocks();
    geminiFactory = makeMockFactory("gemini");
    anthropicFactory = makeMockFactory("anthropic");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createProviderRouter — model routing", () => {
    it("routes 'gemini-2.5-pro' to the gemini factory via prefix match", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: { apiKey: "gk" } },
                anthropic: { factory: anthropicFactory.factory, config: { apiKey: "ak" } },
            },
            modelToProvider: { gemini: "gemini", claude: "anthropic" },
        });

        const opts = makeStreamOpts("gemini-2.5-pro");
        const result = await router.streamChat(opts);

        expect(geminiFactory.factoryFn).toHaveBeenCalledOnce();
        expect(geminiFactory.factoryFn).toHaveBeenCalledWith({ apiKey: "gk" });
        expect(geminiFactory.provider.streamChat).toHaveBeenCalledWith(opts);
        expect(result.text).toBe("response from gemini");
    });

    it("routes 'claude-sonnet-4-6' to the anthropic factory via prefix match", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: { apiKey: "gk" } },
                anthropic: { factory: anthropicFactory.factory, config: { apiKey: "ak" } },
            },
            modelToProvider: { gemini: "gemini", claude: "anthropic" },
        });

        const opts = makeStreamOpts("claude-sonnet-4-6");
        const result = await router.streamChat(opts);

        expect(anthropicFactory.factoryFn).toHaveBeenCalledOnce();
        expect(anthropicFactory.factoryFn).toHaveBeenCalledWith({ apiKey: "ak" });
        expect(anthropicFactory.provider.streamChat).toHaveBeenCalledWith(opts);
        expect(result.text).toBe("response from anthropic");
    });

    it("does not initialize the unused provider factory", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
                anthropic: { factory: anthropicFactory.factory, config: {} },
            },
            modelToProvider: { gemini: "gemini", claude: "anthropic" },
        });

        await router.streamChat(makeStreamOpts("gemini-2.5-pro"));

        expect(geminiFactory.factoryFn).toHaveBeenCalledOnce();
        expect(anthropicFactory.factoryFn).not.toHaveBeenCalled();
    });
});

describe("createProviderRouter — lazy initialization and caching", () => {
    it("calls the factory only once across multiple streamChat calls", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: { apiKey: "gk" } },
            },
            modelToProvider: { gemini: "gemini" },
        });

        await router.streamChat(makeStreamOpts("gemini-2.5-pro"));
        await router.streamChat(makeStreamOpts("gemini-2.5-flash"));
        await router.streamChat(makeStreamOpts("gemini-2.0-flash"));

        // Factory should be called exactly once — the instance is reused
        expect(geminiFactory.factoryFn).toHaveBeenCalledOnce();
        // But streamChat should be called for each request
        expect(geminiFactory.provider.streamChat).toHaveBeenCalledTimes(3);
    });

    it("creates separate instances for different providers", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
                anthropic: { factory: anthropicFactory.factory, config: {} },
            },
            modelToProvider: { gemini: "gemini", claude: "anthropic" },
        });

        await router.streamChat(makeStreamOpts("gemini-2.5-pro"));
        await router.streamChat(makeStreamOpts("claude-sonnet-4-6"));

        expect(geminiFactory.factoryFn).toHaveBeenCalledOnce();
        expect(anthropicFactory.factoryFn).toHaveBeenCalledOnce();
    });
});

describe("createProviderRouter — unknown model handling", () => {
    it("throws an error for an unrecognized model ID", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
            },
            modelToProvider: { gemini: "gemini" },
        });

        await expect(
            router.streamChat(makeStreamOpts("gpt-4o")),
        ).rejects.toThrow(/Unknown model "gpt-4o"/);
    });

    it("error message includes known prefixes", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
                anthropic: { factory: anthropicFactory.factory, config: {} },
            },
            modelToProvider: { gemini: "gemini", claude: "anthropic" },
        });

        await expect(
            router.streamChat(makeStreamOpts("llama-3")),
        ).rejects.toThrow(/Known prefixes: gemini, claude/);
    });

    it("does not initialize any factory when the model is unknown", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
            },
            modelToProvider: { gemini: "gemini" },
        });

        try {
            await router.streamChat(makeStreamOpts("unknown-model"));
        } catch {
            // expected
        }

        expect(geminiFactory.factoryFn).not.toHaveBeenCalled();
    });
});

describe("createProviderRouter — exact vs prefix matching", () => {
    it("exact match takes priority over prefix match", async () => {
        // Register both a prefix "gemini" and an exact model "gemini-special"
        // pointing to different providers
        const specialFactory = makeMockFactory("special");

        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
                special: { factory: specialFactory.factory, config: {} },
            },
            modelToProvider: {
                "gemini": "gemini",
                "gemini-special": "special",
            },
        });

        // "gemini-special" should match exactly to "special", not prefix to "gemini"
        await router.streamChat(makeStreamOpts("gemini-special"));

        expect(specialFactory.factoryFn).toHaveBeenCalledOnce();
        expect(geminiFactory.factoryFn).not.toHaveBeenCalled();
    });

    it("prefix match is used when there is no exact match", async () => {
        const specialFactory = makeMockFactory("special");

        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
                special: { factory: specialFactory.factory, config: {} },
            },
            modelToProvider: {
                "gemini": "gemini",
                "gemini-special": "special",
            },
        });

        // "gemini-2.5-pro" should fall through to prefix "gemini"
        await router.streamChat(makeStreamOpts("gemini-2.5-pro"));

        expect(geminiFactory.factoryFn).toHaveBeenCalledOnce();
        expect(specialFactory.factoryFn).not.toHaveBeenCalled();
    });
});

describe("createProviderRouter — streamChat forwarding", () => {
    it("forwards the exact opts object to the provider's streamChat", async () => {
        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
            },
            modelToProvider: { gemini: "gemini" },
        });

        const opts = makeStreamOpts("gemini-2.5-pro");
        await router.streamChat(opts);

        // Verify referential equality — the router does not transform opts
        expect(geminiFactory.provider.streamChat).toHaveBeenCalledWith(opts);
    });

    it("returns the exact StreamResult from the provider", async () => {
        const expectedResult: StreamResult = {
            text: "response from gemini",
            tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };

        const router = createProviderRouter({
            registry: {
                gemini: { factory: geminiFactory.factory, config: {} },
            },
            modelToProvider: { gemini: "gemini" },
        });

        const result = await router.streamChat(makeStreamOpts("gemini-2.5-pro"));

        expect(result).toEqual(expectedResult);
    });
});

describe("createProviderRouter — missing registry entry", () => {
    it("throws when model maps to a provider name not in the registry", async () => {
        const router = createProviderRouter({
            registry: {},
            modelToProvider: { gemini: "gemini" },
        });

        await expect(
            router.streamChat(makeStreamOpts("gemini-2.5-pro")),
        ).rejects.toThrow(/No provider registered for "gemini"/);
    });
});
