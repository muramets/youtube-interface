/**
 * copy-shared.js — Pre-build script that copies shared/ → src/shared/
 *
 * Only models.ts is truly shared between frontend and backend.
 * auth.ts and db.ts are backend-only and live permanently in src/shared/.
 *
 * Run automatically via npm lifecycle: "prebuild" → "build" (tsc)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = resolve(__dirname, '../../shared');
const TARGET_DIR = resolve(__dirname, '../src/shared');

// Files to copy from project-level shared/ into functions/src/shared/
const SHARED_FILES = ['models.ts'];

const HEADER = `// ⚠️ AUTO-GENERATED — DO NOT EDIT DIRECTLY.\n// Source of truth: /shared/models.ts\n// Copied by: functions/scripts/copy-shared.mjs\n\n`;

mkdirSync(TARGET_DIR, { recursive: true });

for (const file of SHARED_FILES) {
    const src = resolve(SHARED_ROOT, file);
    const dest = resolve(TARGET_DIR, file);
    const raw = readFileSync(src, 'utf-8');
    // Strip any existing auto-generated headers to prevent accumulation
    const content = raw.replace(/^(\/\/ ⚠️ AUTO-GENERATED[^\n]*\n\/\/ Source of truth:[^\n]*\n\/\/ Copied by:[^\n]*\n\n)+/g, '');
    writeFileSync(dest, HEADER + content);
    console.log(`[copy-shared] ${file} → src/shared/${file}`);
}
