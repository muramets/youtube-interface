/**
 * logger.ts — Structured logging for Cloud Run Job.
 *
 * Outputs JSON to stdout/stderr for Cloud Logging ingestion.
 * Includes renderId from env for easy filtering.
 */

export function log(step: string, data?: Record<string, unknown>) {
    const entry = {
        severity: 'INFO',
        renderId: process.env.RENDER_ID,
        step,
        timestamp: new Date().toISOString(),
        ...data,
    };
    console.log(JSON.stringify(entry));
}

export function logError(step: string, error: unknown) {
    const entry = {
        severity: 'ERROR',
        renderId: process.env.RENDER_ID,
        step,
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
    };
    console.error(JSON.stringify(entry));
}
