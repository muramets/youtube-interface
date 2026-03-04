// =============================================================================
// AI Retry — Generic retry logic for streaming AI calls
//
// Provider-agnostic retry logic for streaming AI calls.
// Each provider supplies its own `isTransient` predicate.
// =============================================================================

// --- Custom error for stream inactivity timeout ---

/**
 * Thrown when the AI model stream stalls (no chunks within the timeout window).
 * Providers should use this as a standard timeout signal.
 */
export class AiStreamTimeoutError extends Error {
    constructor(message = "AI model did not respond within the timeout window. Please try again.") {
        super(message);
        this.name = "AiStreamTimeoutError";
    }
}

// --- Retry options ---

export interface StreamRetryOpts {
    /** Maximum number of retries (not counting the initial attempt). */
    maxRetries: number;
    /** Provider-specific predicate: returns true if the error is transient and safe to retry. */
    isTransient: (err: unknown) => boolean;
    /** Delay in ms before retrying (applied to all transient errors). Defaults to 2000. */
    delayMs?: number;
    /** Called on each retry attempt (1-indexed). */
    onRetry?: (attempt: number) => void;
    /** AbortSignal for caller-initiated cancellation — skips retry if aborted. */
    signal?: AbortSignal;
}

// --- Generic retry wrapper ---

/**
 * Execute `fn` with automatic retries on transient errors.
 *
 * Flow:
 *   1. Call fn()
 *   2. If it throws and isTransient(err) === true:
 *      - If caller has aborted (signal.aborted) → re-throw immediately
 *      - If attempts remain → wait delayMs, call onRetry, try again
 *      - If exhausted → re-throw
 *   3. If it throws and isTransient(err) === false → re-throw immediately
 *   4. On success → return result
 */
export async function withStreamRetry<T>(
    fn: () => Promise<T>,
    opts: StreamRetryOpts,
): Promise<T> {
    const { maxRetries, isTransient, delayMs = 2_000, onRetry, signal } = opts;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (err) {
            // Non-transient errors propagate immediately
            if (!isTransient(err)) throw err;

            // If the caller cancelled, don't retry — propagate immediately
            if (signal?.aborted) throw err;

            // If we have retries left, wait and try again
            if (attempt <= maxRetries) {
                console.log(
                    `[withStreamRetry] Retry attempt ${attempt}/${maxRetries} after transient error`,
                );
                if (delayMs > 0) {
                    await new Promise((r) => setTimeout(r, delayMs));
                }
                onRetry?.(attempt);
                continue;
            }

            // Exhausted all retries — propagate
            throw err;
        }
    }

    // Unreachable — TypeScript needs this for exhaustive return
    throw new Error("[withStreamRetry] Unexpected: retry loop exited without return or throw");
}
