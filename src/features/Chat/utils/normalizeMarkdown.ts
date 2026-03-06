/**
 * Normalizes raw LLM markdown output before rendering.
 * Fixes common structural issues that break GFM parsers.
 */

const TABLE_SEPARATOR_RE = /^\s*\|(\s*[-:]+\s*\|)+\s*$/;
const CODE_FENCE_RE = /^(\s*`{3,})/;

export function normalizeMarkdown(text: string): string {
  return fixGluedTables(text);
}

/**
 * Fixes table headers glued to preceding text without a line break.
 * "### Heading| Col | Col |"  →  "### Heading\n\n| Col | Col |"
 */
function fixGluedTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let insideCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code fences — don't touch content inside code blocks
    if (CODE_FENCE_RE.test(line)) {
      insideCodeBlock = !insideCodeBlock;
      result.push(line);
      continue;
    }

    if (insideCodeBlock) {
      result.push(line);
      continue;
    }

    // When we find a table separator, check if the previous line is a glued header
    if (TABLE_SEPARATOR_RE.test(line) && result.length > 0) {
      const prevIndex = result.length - 1;
      const prevLine = result[prevIndex];
      const pipeIndex = prevLine.indexOf('|');

      // Previous line has text before the first `|` — it's glued
      if (pipeIndex > 0 && !prevLine.trimStart().startsWith('|')) {
        const textPart = prevLine.slice(0, pipeIndex).trimEnd();
        const tablePart = prevLine.slice(pipeIndex);

        // Verify tablePart looks like a header row (at least 2 pipes)
        if ((tablePart.match(/\|/g) || []).length >= 2) {
          result[prevIndex] = textPart;
          result.push('');
          result.push(tablePart);
        }
      }
    }

    result.push(line);
  }

  return result.join('\n');
}
