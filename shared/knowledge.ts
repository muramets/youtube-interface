/**
 * Shared Knowledge Items constants — SSOT for both frontend and backend.
 */

/** Slug must be lowercase kebab-case. Dots would corrupt Firestore map field paths. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
