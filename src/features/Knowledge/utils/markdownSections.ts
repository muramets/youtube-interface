/**
 * Markdown section parser — splits markdown into hierarchical sections by headers.
 * Used by KnowledgeCard to render collapsible sections (headers collapsed by default).
 *
 * Ported from MonkeyLearn markdownUtils.ts.
 */

export interface MarkdownSection {
    title: string;
    level: number;
    content: string[];
}

export interface HierarchicalSection extends MarkdownSection {
    children: HierarchicalSection[];
}

export interface MarkdownParseResult {
    preamble: string;
    sections: HierarchicalSection[];
}

/**
 * Parse markdown into flat sections by header boundaries.
 * Content before the first header becomes `preamble`.
 */
function parseFlat(markdown: string): { preamble: string; sections: MarkdownSection[] } {
    if (!markdown) return { preamble: '', sections: [] };

    const lines = markdown.split(/\r?\n/);
    const sections: MarkdownSection[] = [];
    let current: MarkdownSection | null = null;
    const preamble: string[] = [];

    for (const line of lines) {
        const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
        if (match) {
            if (current) sections.push(current);
            current = { title: match[2], level: match[1].length, content: [] };
        } else if (current) {
            current.content.push(line);
        } else {
            preamble.push(line);
        }
    }
    if (current) sections.push(current);

    return { preamble: preamble.join('\n'), sections };
}

/**
 * Nest flat sections into a hierarchy based on header levels.
 * H2 following H1 becomes a child of H1, etc.
 */
function nestSections(sections: MarkdownSection[]): HierarchicalSection[] {
    const root: HierarchicalSection[] = [];
    const stack: HierarchicalSection[] = [];

    for (const section of sections) {
        const node: HierarchicalSection = { ...section, children: [] };

        while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
            stack.pop();
        }

        if (stack.length === 0) {
            root.push(node);
        } else {
            stack[stack.length - 1].children.push(node);
        }

        stack.push(node);
    }

    return root;
}

/**
 * Parse markdown into hierarchical collapsible sections.
 */
export function parseMarkdownSections(markdown: string): MarkdownParseResult {
    const { preamble, sections } = parseFlat(markdown);
    return { preamble, sections: nestSections(sections) };
}
