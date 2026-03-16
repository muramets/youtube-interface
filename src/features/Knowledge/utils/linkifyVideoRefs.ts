import type { VideoPreviewData } from '../../Video/types'

/**
 * Pre-process markdown: wrap raw video IDs in vid:// links.
 * Fallback for old KI with raw IDs (pre-vid:// content).
 * Skips IDs already inside vid:// or mention:// links to avoid double-wrapping.
 *
 * @deprecated Remove when all KI re-saved with vid:// format
 */
export function linkifyVideoRefs(markdown: string, videoMap: Map<string, VideoPreviewData>): string {
    if (videoMap.size === 0) return markdown
    // Sort by length descending to match longer IDs first (e.g. custom-1773061458547 before 1773061458547)
    const ids = Array.from(videoMap.keys()).sort((a, b) => b.length - a.length)
    const escapedIds = ids.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    // Two-alternative regex:
    // 1st alt: matches any markdown link [...](...) — captured without group → skip
    // 2nd alt: matches bare video IDs — captured in group 1 → linkify
    const pattern = new RegExp(
        `\\[[^\\]]*\\]\\([^)]*\\)|(?<![\\w/-])(${escapedIds})(?![\\w/-])`,
        'g'
    )
    return markdown.replace(pattern, (fullMatch, capturedId: string | undefined) => {
        if (!capturedId) return fullMatch // existing markdown link — leave unchanged
        const video = videoMap.get(capturedId)
        const title = video?.title || capturedId
        return `[${title}](vid://${capturedId})`
    })
}
