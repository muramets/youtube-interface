// ---------------------------------------------------------------------------
// Image token estimation — Gemini (lookup) + Claude (tile formula)
// ---------------------------------------------------------------------------

import { MODEL_REGISTRY } from './models.js';

// Claude vision tile constants (from Anthropic docs)
const CLAUDE_TILE_SIZE = 364;
const CLAUDE_TOKENS_PER_TILE = 170;
const CLAUDE_MAX_DIMENSION = 1568;
const CLAUDE_MAX_PIXELS = 1_150_000;

/**
 * Estimate tokens for a single image on Claude models.
 * Formula: ceil(w/364) * ceil(h/364) * 170 (after resize to fit constraints).
 */
export function estimateClaudeImageTokens(width: number, height: number): number {
    let w = width;
    let h = height;

    // Step 1: Scale so max dimension ≤ 1568
    if (w > CLAUDE_MAX_DIMENSION || h > CLAUDE_MAX_DIMENSION) {
        const scale = CLAUDE_MAX_DIMENSION / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
    }

    // Step 2: Scale so total pixels ≤ 1,150,000
    if (w * h > CLAUDE_MAX_PIXELS) {
        const scale = Math.sqrt(CLAUDE_MAX_PIXELS / (w * h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
    }

    return Math.ceil(w / CLAUDE_TILE_SIZE) * Math.ceil(h / CLAUDE_TILE_SIZE) * CLAUDE_TOKENS_PER_TILE;
}

/** Default YouTube thumbnail dimensions (fallback for unknown URLs). */
const YT_THUMBNAIL_WIDTH = 1280;
const YT_THUMBNAIL_HEIGHT = 720;

/**
 * YouTube CDN thumbnail sizes by filename pattern.
 * Used to parse actual dimensions from thumbnail URLs for accurate token estimation.
 */
const YT_THUMBNAIL_SIZES: Record<string, { width: number; height: number }> = {
    'maxresdefault': { width: 1280, height: 720 },
    'sddefault':     { width: 640, height: 480 },
    'hqdefault':     { width: 480, height: 360 },
    'mqdefault':     { width: 320, height: 180 },
    'default':       { width: 120, height: 90 },
};

/**
 * Parse YouTube thumbnail URL to determine actual image dimensions.
 * Falls back to maxresdefault (1280×720) for non-YouTube or unrecognized URLs.
 */
export function parseYouTubeThumbnailSize(url: string): { width: number; height: number } {
    for (const [pattern, size] of Object.entries(YT_THUMBNAIL_SIZES)) {
        if (url.includes(`/${pattern}.`)) return size;
    }
    return { width: YT_THUMBNAIL_WIDTH, height: YT_THUMBNAIL_HEIGHT };
}

/**
 * Estimate total image tokens for a model.
 * - Gemini: fixed per-image from MODEL_REGISTRY.imageTokensPerImage
 * - Claude: tile formula per image (falls back to YouTube thumbnail size)
 */
export function estimateImageTokens(
    modelId: string,
    images: Array<{ width?: number; height?: number }>,
): number {
    if (images.length === 0) return 0;

    const model = MODEL_REGISTRY.find(m => m.id === modelId);
    if (!model) return 0;

    // Gemini: fixed tokens per image
    if (model.imageTokensPerImage != null) {
        return model.imageTokensPerImage * images.length;
    }

    // Claude: tile formula per image
    return images.reduce((sum, img) => {
        const w = img.width ?? YT_THUMBNAIL_WIDTH;
        const h = img.height ?? YT_THUMBNAIL_HEIGHT;
        return sum + estimateClaudeImageTokens(w, h);
    }, 0);
}
