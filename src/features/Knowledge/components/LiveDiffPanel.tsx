import { useState, useEffect, useMemo } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { buildBodyComponents } from '../utils/bodyComponents'
import { computeDiffBlocks } from '../utils/diffUtils'
import { DiffBlockView } from './RenderedDiffViewer'
import type { VideoPreviewData } from '../../Video/types'

interface LiveDiffPanelProps {
    /** Content of the selected previous version */
    oldContent: string
    /** Current editor content (updates in real-time) */
    newContent: string
    /** Label for the version being compared */
    label?: string
    /** Video data map for vid:// link tooltips */
    videoMap?: Map<string, VideoPreviewData>
    /** Close the diff panel (exit compare mode) */
    onClose?: () => void
    /** Restore editor content to this version */
    onRestore?: () => void
}

const DEBOUNCE_MS = 300

/**
 * LiveDiffPanel — rendered markdown diff for the editor side panel.
 *
 * Shows the OLD version with diff highlights. Reuses DiffBlockView from
 * RenderedDiffViewer. Debounced to avoid lag during fast typing.
 */
export const LiveDiffPanel = ({ oldContent, newContent, label, videoMap, onClose, onRestore }: LiveDiffPanelProps) => {
    const [debouncedNew, setDebouncedNew] = useState(newContent)

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedNew(newContent), DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [newContent])

    const { left, stats } = useMemo(
        () => computeDiffBlocks(oldContent, debouncedNew),
        [oldContent, debouncedNew],
    )

    const mdComponents = useMemo(() => buildBodyComponents(videoMap), [videoMap])

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-3 py-2 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--diff-separator)' }}>
                <span className="text-[11px] font-medium text-text-secondary truncate">
                    {label || 'Previous version'}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {(stats.added > 0 || stats.removed > 0) && (
                        <span className="text-[10px] text-text-tertiary flex gap-2">
                            {stats.added > 0 && (
                                <span style={{ color: 'var(--diff-added-text)' }}>+{stats.added}</span>
                            )}
                            {stats.removed > 0 && (
                                <span style={{ color: 'var(--diff-removed-text)' }}>-{stats.removed}</span>
                            )}
                        </span>
                    )}
                    {onRestore && (
                        <button
                            onClick={onRestore}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/10 rounded transition-colors"
                            title="Restore this version"
                        >
                            <RotateCcw size={11} />
                            Restore
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-0.5 text-text-tertiary hover:text-text-primary transition-colors rounded"
                            title="Close compare mode"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Rendered diff blocks — old version side */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
                {left.map((block, i) => (
                    <DiffBlockView
                        key={i}
                        block={block}
                        side="left"
                        components={mdComponents}
                    />
                ))}
            </div>
        </div>
    )
}
