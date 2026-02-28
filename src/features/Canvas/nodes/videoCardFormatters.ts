// Shared formatters for video card display — used by VideoCardUI/VideoCardNode and MediumLodNode.
// Extracted to a separate file to satisfy react-refresh/only-export-components rule.

export function formatViewCount(raw?: string): string | null {
    if (!raw) return null;
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (isNaN(n) || n === 0) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K views`;
    return `${n} views`;
}

export function formatPublishDate(raw?: string): string | null {
    if (!raw) return null;
    const date = new Date(raw);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
}
