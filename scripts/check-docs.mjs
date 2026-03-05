#!/usr/bin/env node

// =============================================================================
// Feature doc link checker
//
// Checks all .md files in docs/features/ for:
//   1. Broken markdown links  — [text](./path.md) → file must exist
//   2. Broken code file paths — `path/to/File.tsx` in tables → file must exist
//
// Exit code 0 = all links valid, 1 = broken links found.
// =============================================================================

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const DOCS_DIR = join(ROOT, "docs", "features");

// Directories where code file paths are resolved against
const CODE_ROOTS = [
    join(ROOT, "src"),
    ROOT, // for `functions/src/...` paths
];

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

function findMarkdownFiles(dir) {
    const results = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findMarkdownFiles(full));
        else if (entry.name.endsWith(".md")) results.push(full);
    }
    return results;
}

// ---------------------------------------------------------------------------
// Checkers
// ---------------------------------------------------------------------------

/**
 * Check markdown links: [text](relative/path.md)
 * Ignores external URLs (http/https) and anchors (#).
 */
function checkMarkdownLinks(filePath, content) {
    const errors = [];
    // Match [text](path) — but not ![img](path)
    const linkRe = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRe.exec(content)) !== null) {
        const target = match[2].split("#")[0]; // strip anchor
        if (!target) continue; // pure anchor link
        if (/^https?:\/\//.test(target)) continue; // external URL
        if (target.startsWith("mailto:")) continue;
        if (target.includes("://")) continue; // custom protocols (mention://, etc.)

        const resolved = resolve(dirname(filePath), target);
        if (!existsSync(resolved)) {
            const line = content.slice(0, match.index).split("\n").length;
            errors.push({ line, type: "markdown-link", target, resolved });
        }
    }

    return errors;
}

/**
 * Check code file paths in markdown tables.
 * Pattern: `some/path/File.ts(x)` inside table cells (lines starting with |).
 */
function checkCodePaths(filePath, content) {
    const errors = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Only check table rows (start with |)
        if (!line.trimStart().startsWith("|")) continue;

        // Find backtick-wrapped paths that look like code files
        const pathRe = /`([\w@/.-]+\.(?:ts|tsx|js|jsx|mjs|cjs))`/g;
        let match;

        while ((match = pathRe.exec(line)) !== null) {
            const codePath = match[1];

            // Skip obvious non-paths (single filenames without slashes
            // that are likely just mentioning a utility name like `csvUtils.ts`)
            if (!codePath.includes("/")) continue;

            // Try resolving against each code root
            const found = CODE_ROOTS.some((root) =>
                existsSync(join(root, codePath)),
            );

            if (!found) {
                errors.push({
                    line: i + 1,
                    type: "code-path",
                    target: codePath,
                });
            }
        }
    }

    return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    if (!existsSync(DOCS_DIR)) {
        console.error(`Docs directory not found: ${DOCS_DIR}`);
        process.exit(1);
    }

    const files = findMarkdownFiles(DOCS_DIR);
    let totalErrors = 0;

    for (const file of files) {
        const content = readFileSync(file, "utf-8");
        const relPath = file.replace(ROOT + "/", "");

        const linkErrors = checkMarkdownLinks(file, content);
        const codeErrors = checkCodePaths(file, content);
        const allErrors = [...linkErrors, ...codeErrors];

        if (allErrors.length > 0) {
            console.log(`\n  ${relPath}`);
            for (const err of allErrors) {
                const icon = err.type === "markdown-link" ? "link" : "file";
                console.log(`    L${err.line}  [${icon}]  ${err.target}`);
            }
            totalErrors += allErrors.length;
        }
    }

    if (totalErrors > 0) {
        console.log(`\n  ${totalErrors} broken reference(s) found.\n`);
        process.exit(1);
    } else {
        console.log("  All doc references valid.\n");
        process.exit(0);
    }
}

main();
