import { describe, it, expect } from 'vitest';
import { estimateClaudeImageTokens, estimateImageTokens } from '../imageTokens';

// =============================================================================
// estimateClaudeImageTokens — tile formula
// =============================================================================

describe('estimateClaudeImageTokens', () => {
    it('YouTube thumbnail 1280x720 → 1360 tokens', () => {
        // ceil(1280/364) * ceil(720/364) * 170 = 4 * 2 * 170 = 1360
        expect(estimateClaudeImageTokens(1280, 720)).toBe(1360);
    });

    it('small image 100x100 → 170 tokens (1 tile)', () => {
        // ceil(100/364) * ceil(100/364) * 170 = 1 * 1 * 170
        expect(estimateClaudeImageTokens(100, 100)).toBe(170);
    });

    it('scales down when dimension exceeds 1568', () => {
        // 3136x1568 → scale by 1568/3136 = 0.5 → 1568x784
        // ceil(1568/364) * ceil(784/364) * 170 = 5 * 3 * 170 = 2550
        // Math.round(3136 * 0.5) = 1568, Math.round(1568 * 0.5) = 784
        expect(estimateClaudeImageTokens(3136, 1568)).toBe(2550);
    });

    it('scales down when total pixels exceed 1,150,000', () => {
        // 1568x1568 = 2,458,624 pixels > 1,150,000
        // After max-dimension check: already ≤ 1568
        // Pixel scale: sqrt(1150000 / 2458624) ≈ 0.6837
        // w = round(1568 * 0.6837) = 1072, h = round(1568 * 0.6837) = 1072
        // ceil(1072/364) * ceil(1072/364) * 170 = 3 * 3 * 170 = 1530
        expect(estimateClaudeImageTokens(1568, 1568)).toBe(1530);
    });

    it('exact 364x364 → 170 tokens (1 tile)', () => {
        expect(estimateClaudeImageTokens(364, 364)).toBe(170);
    });

    it('365x365 → 680 tokens (2x2 tiles)', () => {
        // ceil(365/364) * ceil(365/364) * 170 = 2 * 2 * 170
        expect(estimateClaudeImageTokens(365, 365)).toBe(680);
    });
});

// =============================================================================
// estimateImageTokens — unified (Gemini lookup + Claude formula)
// =============================================================================

describe('estimateImageTokens', () => {
    it('Gemini 2.5 Pro: fixed 258 tokens per image', () => {
        const result = estimateImageTokens('gemini-2.5-pro', [
            { width: 1280, height: 720 },
            { width: 1280, height: 720 },
            { width: 800, height: 600 },
        ]);
        expect(result).toBe(258 * 3);
    });

    it('Gemini 3.1 Pro: fixed 1090 tokens per image', () => {
        const result = estimateImageTokens('gemini-3.1-pro-preview', [
            { width: 1280, height: 720 },
        ]);
        expect(result).toBe(1090);
    });

    it('Gemini ignores dimensions (fixed per-image)', () => {
        const small = estimateImageTokens('gemini-2.5-flash', [{ width: 100, height: 100 }]);
        const large = estimateImageTokens('gemini-2.5-flash', [{ width: 4000, height: 3000 }]);
        expect(small).toBe(large);
        expect(small).toBe(258);
    });

    it('Claude uses tile formula per image', () => {
        const result = estimateImageTokens('claude-opus-4-6', [
            { width: 1280, height: 720 },
        ]);
        expect(result).toBe(1360); // 4 * 2 * 170
    });

    it('Claude: different sizes produce different token counts', () => {
        const small = estimateImageTokens('claude-sonnet-4-6', [{ width: 100, height: 100 }]);
        const large = estimateImageTokens('claude-sonnet-4-6', [{ width: 1280, height: 720 }]);
        expect(small).toBe(170);  // 1 tile
        expect(large).toBe(1360); // 8 tiles
    });

    it('Claude: falls back to YouTube thumbnail size when dimensions missing', () => {
        const withDimensions = estimateImageTokens('claude-opus-4-6', [{ width: 1280, height: 720 }]);
        const withoutDimensions = estimateImageTokens('claude-opus-4-6', [{}]);
        expect(withoutDimensions).toBe(withDimensions);
    });

    it('returns 0 for unknown model', () => {
        expect(estimateImageTokens('unknown-model', [{ width: 100, height: 100 }])).toBe(0);
    });

    it('returns 0 for empty images array', () => {
        expect(estimateImageTokens('gemini-2.5-pro', [])).toBe(0);
    });

    it('handles multiple Claude images with mixed dimensions', () => {
        const result = estimateImageTokens('claude-haiku-4-5', [
            { width: 100, height: 100 },   // 170
            { width: 1280, height: 720 },   // 1360
            {},                              // 1360 (default thumbnail)
        ]);
        expect(result).toBe(170 + 1360 + 1360);
    });
});
