import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { BookOpen } from 'lucide-react'
import { SegmentedControl } from '../../../../ui/molecules/SegmentedControl'
import type { VideoPreviewData } from '../../../../../features/Video/types'
import type { KiPreviewData } from '../types'

export type MentionMode = 'videos' | 'knowledge'

export type SuggestionItem =
    | { kind: 'video'; data: VideoPreviewData }
    | { kind: 'ki'; data: KiPreviewData }

export interface UnifiedSuggestionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface UnifiedSuggestionListProps {
    items: SuggestionItem[]
    command: (item: SuggestionItem) => void
    mode: MentionMode
    onModeChange: (mode: MentionMode) => void
    hasVideos: boolean
    hasKnowledge: boolean
    /** Current query length — dropdown hidden until >= 2 chars */
    queryLength: number
    /** videoId → thumbnailUrl lookup for KI rows with video scope */
    videoThumbnailMap?: Map<string, string>
}

export const UnifiedSuggestionList = forwardRef<UnifiedSuggestionListRef, UnifiedSuggestionListProps>(
    ({ items, command, mode, onModeChange, hasVideos, hasKnowledge, queryLength, videoThumbnailMap }, ref) => {
        const [rawIndex, setRawIndex] = useState(0)
        const listRef = useRef<HTMLDivElement>(null)

        const selectedIndex = items.length > 0 ? Math.min(rawIndex, items.length - 1) : 0

        const selectItem = useCallback((index: number) => {
            const item = items[index]
            if (item) command(item)
        }, [items, command])

        const toggleMode = useCallback(() => {
            const next = mode === 'videos' ? 'knowledge' : 'videos'
            const canSwitch = next === 'videos' ? hasVideos : hasKnowledge
            if (!canSwitch) return
            onModeChange(next)
            setRawIndex(0)
        }, [mode, onModeChange, hasVideos, hasKnowledge])

        useEffect(() => {
            if (items.length === 0) return
            listRef.current
                ?.querySelector<HTMLButtonElement>(`button[data-index="${selectedIndex}"]`)
                ?.scrollIntoView({ block: 'nearest' })
        }, [selectedIndex, items.length])

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                if (event.key === 'Tab') {
                    event.preventDefault()
                    toggleMode()
                    return true
                }
                if (event.key === 'ArrowUp') {
                    setRawIndex((i) => (i + items.length - 1) % items.length)
                    return true
                }
                if (event.key === 'ArrowDown') {
                    setRawIndex((i) => (i + 1) % items.length)
                    return true
                }
                if (event.key === 'Enter') {
                    selectItem(selectedIndex)
                    return true
                }
                return false
            },
        }), [items.length, selectItem, selectedIndex, toggleMode])

        // Hide dropdown until user types 2+ chars after @
        if (queryLength < 2) return null

        return (
            <div
                ref={listRef}
                className="bg-[var(--settings-dropdown-bg)] border border-border rounded-xl shadow-2xl overflow-hidden w-[320px]"
            >
                {/* Mode switcher */}
                <div className="px-2 pt-2 pb-1">
                    <SegmentedControl
                        options={[
                            { value: 'videos' as const, label: 'Videos', disabled: !hasVideos },
                            { value: 'knowledge' as const, label: 'Knowledge', disabled: !hasKnowledge },
                        ]}
                        value={mode}
                        onChange={(v) => { onModeChange(v); setRawIndex(0) }}
                    />
                </div>

                {/* Items list */}
                <div className="overflow-y-auto overscroll-none max-h-[280px] py-1">
                    {items.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-text-tertiary text-center">
                            No matches found
                        </div>
                    ) : (
                        items.map((item, index) => (
                            <button
                                key={item.kind === 'video' ? item.data.videoId : item.data.id}
                                data-index={index}
                                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer border-none hover-trail ${
                                    index === selectedIndex ? 'bg-[var(--settings-dropdown-hover)]' : 'hover:bg-[var(--settings-dropdown-hover)]'
                                }`}
                                onClick={() => selectItem(index)}
                                onMouseEnter={() => setRawIndex(index)}
                            >
                                {item.kind === 'video' ? (
                                    <VideoRow video={item.data} />
                                ) : (
                                    <KiRow ki={item.data} videoThumbnailMap={videoThumbnailMap} />
                                )}
                            </button>
                        ))
                    )}
                </div>

                {/* Hint */}
                <div className="px-3 py-1 border-t border-border text-[9px] text-text-tertiary text-center">
                    Tab to switch
                </div>
            </div>
        )
    }
)

UnifiedSuggestionList.displayName = 'UnifiedSuggestionList'

// --- Row components ---

function VideoRow({ video }: { video: VideoPreviewData }) {
    return (
        <>
            {video.thumbnailUrl && (
                <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="w-12 aspect-video object-cover rounded flex-shrink-0"
                />
            )}
            <div className="flex-1 min-w-0">
                <div className="text-xs text-text-primary truncate">{video.title}</div>
                {video.channelTitle && (
                    <div className="text-[10px] text-text-tertiary truncate">{video.channelTitle}</div>
                )}
            </div>
            {video.ownership === 'competitor' && (
                <span className="text-[9px] text-text-tertiary bg-white/[0.06] px-1.5 py-0.5 rounded-full flex-shrink-0">
                    Competitor
                </span>
            )}
        </>
    )
}

function KiRow({ ki, videoThumbnailMap }: { ki: KiPreviewData; videoThumbnailMap?: Map<string, string> }) {
    const thumbnailUrl = ki.videoId ? videoThumbnailMap?.get(ki.videoId) : undefined

    return (
        <>
            {thumbnailUrl ? (
                <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-12 aspect-video object-cover rounded flex-shrink-0"
                />
            ) : (
                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-accent/10">
                    <BookOpen size={14} className="text-accent" />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="text-xs text-text-primary truncate">{ki.title}</div>
                <div className="text-[10px] text-text-tertiary truncate capitalize">{ki.category.replace(/-/g, ' ')}</div>
            </div>
            <span className="text-[9px] text-text-tertiary bg-white/[0.06] px-1.5 py-0.5 rounded-full flex-shrink-0 capitalize">
                {ki.scope}
            </span>
        </>
    )
}
