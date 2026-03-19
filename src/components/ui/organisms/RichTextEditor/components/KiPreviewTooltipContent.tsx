import type { KiPreviewData } from '../types'

/**
 * Shared tooltip content for ki:// Knowledge Item references.
 * Used in both edit mode (KiRefView MarkView) and read mode (bodyComponents markdown renderer).
 */
export function KiPreviewTooltipContent({ ki }: { ki: KiPreviewData }) {
    return (
        <div className="p-2.5 max-w-[280px]">
            <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                    {ki.category}
                </span>
                <span className="text-[9px] text-text-tertiary capitalize">{ki.scope}</span>
            </div>
            <div className="text-xs font-medium text-text-primary mb-1">{ki.title}</div>
            <div className="text-[11px] text-text-secondary line-clamp-3">{ki.summary}</div>
        </div>
    )
}
