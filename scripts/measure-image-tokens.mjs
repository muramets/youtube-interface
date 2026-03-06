// Usage: GEMINI_API_KEY=... node scripts/measure-image-tokens.mjs
// Or:   node scripts/measure-image-tokens.mjs  (reads key from gcloud secrets)
//
// Measures exact token cost of images in Gemini models using countTokens API.
// No generation calls — zero cost.

import { createRequire } from 'module';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../functions/package.json'));
const { GoogleGenAI } = require('@google/genai');

// --- Get API key ---
let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    try {
        apiKey = execSync(
            'gcloud secrets versions access latest --secret="GEMINI_API_KEY" --project=mytube-46104',
            { encoding: 'utf8' }
        ).trim();
    } catch {
        console.error('Set GEMINI_API_KEY or configure gcloud CLI');
        process.exit(1);
    }
}

const ai = new GoogleGenAI({ apiKey });

// --- Test images: create colored rectangles of different sizes ---
// We'll use inline base64 PNG images generated programmatically.

function createMinimalPng(width, height) {
    // Create a minimal valid PNG with solid color
    // Using raw RGBA data → deflate → PNG chunks
    // For simplicity, use a 1x1 red PNG and rely on the API accepting it,
    // then test with real URLs for larger images.
    // Actually, let's use base64 inline data.

    // Minimal 1x1 red PNG (pre-generated)
    const pixel1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    return pixel1x1;
}

// --- Count tokens for text only ---
async function countTextOnly(model, text) {
    const result = await ai.models.countTokens({
        model,
        contents: [{ role: 'user', parts: [{ text }] }],
    });
    return result.totalTokens;
}

// --- Count tokens for text + inline image ---
async function countWithInlineImage(model, text, base64Data, mimeType) {
    const result = await ai.models.countTokens({
        model,
        contents: [{
            role: 'user',
            parts: [
                { inlineData: { data: base64Data, mimeType } },
                { text },
            ],
        }],
    });
    return result;
}

// --- Count tokens for text + image URL ---
async function countWithImageUrl(model, text, imageUrl) {
    // Use fileData with a public URL (Gemini supports this for some URLs)
    // Actually, countTokens with URLs may not work — let's try inline data
    const result = await ai.models.countTokens({
        model,
        contents: [{
            role: 'user',
            parts: [
                { fileData: { fileUri: imageUrl, mimeType: 'image/jpeg' } },
                { text },
            ],
        }],
    });
    return result;
}

// --- Main ---
const MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
];

const TEXT = 'Describe this image briefly.';

console.log('=== GEMINI IMAGE TOKEN MEASUREMENT ===\n');

// Test 1: Text-only baseline
console.log('--- Baseline: text only ---');
for (const model of MODELS) {
    try {
        const tokens = await countTextOnly(model, TEXT);
        console.log(`  ${model}: ${tokens} tokens for "${TEXT}"`);
    } catch (e) {
        console.log(`  ${model}: ERROR — ${e.message}`);
    }
}

// Test 2: 1x1 pixel image (minimal)
console.log('\n--- Test: 1x1 pixel PNG ---');
const tiny = createMinimalPng(1, 1);
for (const model of MODELS) {
    try {
        const result = await countWithInlineImage(model, TEXT, tiny, 'image/png');
        const textTokens = await countTextOnly(model, TEXT);
        const imageTokens = result.totalTokens - textTokens;
        console.log(`  ${model}: total=${result.totalTokens}, text=${textTokens}, image=${imageTokens}`);
        if (result.promptTokensDetails) {
            console.log(`    details: ${JSON.stringify(result.promptTokensDetails)}`);
        }
    } catch (e) {
        console.log(`  ${model}: ERROR — ${e.message}`);
    }
}

// Test 3: Real-world YouTube thumbnail (1280x720)
// Using a public YouTube thumbnail URL via inline download
console.log('\n--- Test: Real JPEG (YouTube thumbnail 1280x720) ---');
try {
    const thumbnailUrl = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg';
    const response = await fetch(thumbnailUrl);
    if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        console.log(`  Downloaded: ${buffer.length} bytes (${Math.round(buffer.length / 1024)}KB)`);

        for (const model of MODELS) {
            try {
                const result = await countWithInlineImage(model, TEXT, base64, 'image/jpeg');
                const textTokens = await countTextOnly(model, TEXT);
                const imageTokens = result.totalTokens - textTokens;
                console.log(`  ${model}: total=${result.totalTokens}, text=${textTokens}, image=${imageTokens}`);
            } catch (e) {
                console.log(`  ${model}: ERROR — ${e.message}`);
            }
        }
    } else {
        console.log(`  Failed to download thumbnail: ${response.status}`);
    }
} catch (e) {
    console.log(`  Download error: ${e.message}`);
}

// Test 4: Smaller image — typical screenshot ~800x600
console.log('\n--- Test: Small JPEG (Wikipedia logo ~200x200) ---');
try {
    const smallUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Wikipedia-logo-v2.svg/200px-Wikipedia-logo-v2.svg.png';
    const response = await fetch(smallUrl);
    if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        console.log(`  Downloaded: ${buffer.length} bytes (${Math.round(buffer.length / 1024)}KB)`);

        for (const model of MODELS) {
            try {
                const result = await countWithInlineImage(model, TEXT, base64, 'image/png');
                const textTokens = await countTextOnly(model, TEXT);
                const imageTokens = result.totalTokens - textTokens;
                console.log(`  ${model}: total=${result.totalTokens}, text=${textTokens}, image=${imageTokens}`);
            } catch (e) {
                console.log(`  ${model}: ERROR — ${e.message}`);
            }
        }
    }
} catch (e) {
    console.log(`  Download error: ${e.message}`);
}

// Test 5: Multiple images in one request
console.log('\n--- Test: 3x same image (1280x720) — checking linearity ---');
try {
    const thumbnailUrl = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg';
    const response = await fetch(thumbnailUrl);
    if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        const model = MODELS[0]; // test on first model only

        const result = await ai.models.countTokens({
            model,
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { data: base64, mimeType: 'image/jpeg' } },
                    { inlineData: { data: base64, mimeType: 'image/jpeg' } },
                    { inlineData: { data: base64, mimeType: 'image/jpeg' } },
                    { text: TEXT },
                ],
            }],
        });
        const textTokens = await countTextOnly(model, TEXT);
        const imageTokens = result.totalTokens - textTokens;
        console.log(`  ${model}: total=${result.totalTokens}, text=${textTokens}, images(3x)=${imageTokens}, per_image=${Math.round(imageTokens / 3)}`);
    }
} catch (e) {
    console.log(`  Error: ${e.message}`);
}

console.log('\n=== DONE ===');
