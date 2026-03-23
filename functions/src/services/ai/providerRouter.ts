// =============================================================================
// Provider Router — Factory router with lazy initialization
//
// Maps model IDs → provider instances via MODEL_REGISTRY.
// Lazy-initializes each provider on first use and reuses thereafter.
//
// NOTE: ModelConfig.provider field will be added in a later task.
// Until then, the router requires an explicit modelToProvider mapping
// passed via the registry parameter.
// =============================================================================

import type { AiProvider, AiProviderWithGenerateText, GenerateTextOpts, GenerateTextResult, ProviderFactory, ProviderStreamOpts, StreamResult } from "./types.js";

// --- Registry entry ---

/** Configuration for a single provider in the router registry. */
export interface ProviderRegistryEntry {
    /** Factory function that creates the provider instance. */
    factory: ProviderFactory;
    /** Provider-specific configuration (e.g. { apiKey: '...' }). */
    config: Record<string, unknown>;
}

// --- Router options ---

export interface ProviderRouterOpts {
    /** Map of provider name → factory + config. */
    registry: Record<string, ProviderRegistryEntry>;
    /**
     * Map of model ID prefix/pattern → provider name.
     * Used to determine which provider handles a given model.
     * Example: { 'gemini': 'gemini', 'claude': 'anthropic', 'gpt': 'openai' }
     *
     * Matching strategy: the model ID is checked against each key.
     * The first key that the model ID starts with is used.
     */
    modelToProvider: Record<string, string>;
}

// --- Router implementation ---

/**
 * Create a provider router that dispatches streamChat calls to the
 * appropriate provider based on the model ID.
 *
 * Providers are lazy-initialized: the factory is called on the first
 * request for that provider, and the instance is reused for all
 * subsequent calls.
 */
export function createProviderRouter(opts: ProviderRouterOpts): AiProviderWithGenerateText {
    const { registry, modelToProvider } = opts;
    const instances = new Map<string, AiProvider>();

    /**
     * Resolve a model ID to a provider name using the modelToProvider mapping.
     * Returns undefined if no mapping matches.
     */
    function resolveProvider(modelId: string): string | undefined {
        // Exact match first (most specific)
        if (modelToProvider[modelId]) {
            return modelToProvider[modelId];
        }
        // Prefix match (e.g. 'gemini' matches 'gemini-2.5-pro')
        for (const [prefix, providerName] of Object.entries(modelToProvider)) {
            if (modelId.startsWith(prefix)) {
                return providerName;
            }
        }
        return undefined;
    }

    /**
     * Get or create a provider instance by provider name.
     * Lazy initialization: first call creates the instance.
     */
    function getOrCreateProvider(providerName: string): AiProvider {
        const existing = instances.get(providerName);
        if (existing) return existing;

        const entry = registry[providerName];
        if (!entry) {
            throw new Error(
                `[providerRouter] No provider registered for "${providerName}". ` +
                `Registered providers: ${Object.keys(registry).join(", ") || "(none)"}`,
            );
        }

        console.log(`[providerRouter] Initializing provider: ${providerName}`);
        const instance = entry.factory(entry.config);
        instances.set(providerName, instance);
        return instance;
    }

    return {
        async streamChat(streamOpts: ProviderStreamOpts): Promise<StreamResult> {
            const providerName = resolveProvider(streamOpts.model);
            if (!providerName) {
                throw new Error(
                    `[providerRouter] Unknown model "${streamOpts.model}" — ` +
                    `no provider mapping found. Known prefixes: ` +
                    `${Object.keys(modelToProvider).join(", ") || "(none)"}`,
                );
            }

            const provider = getOrCreateProvider(providerName);
            return provider.streamChat(streamOpts);
        },

        async generateText(opts: GenerateTextOpts): Promise<GenerateTextResult> {
            const providerName = resolveProvider(opts.model);
            if (!providerName) {
                throw new Error(
                    `[providerRouter] Unknown model "${opts.model}" — ` +
                    `no provider mapping found. Known prefixes: ` +
                    `${Object.keys(modelToProvider).join(", ") || "(none)"}`,
                );
            }

            const provider = getOrCreateProvider(providerName);
            if (!provider.generateText) {
                throw new Error(
                    `[providerRouter] Provider "${providerName}" does not support generateText.`,
                );
            }
            return provider.generateText(opts);
        },
    };
}
