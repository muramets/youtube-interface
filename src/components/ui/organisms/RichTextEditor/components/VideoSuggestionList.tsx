import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import type { VideoPreviewData } from '../../../../../features/Video/types'

export interface VideoSuggestionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface VideoSuggestionListProps {
    items: VideoPreviewData[]
    command: (item: VideoPreviewData) => void
}

export const VideoSuggestionList = forwardRef<VideoSuggestionListRef, VideoSuggestionListProps>(
    ({ items, command }, ref) => {
        const [rawIndex, setRawIndex] = useState(0)
        const listRef = useRef<HTMLDivElement>(null)

        // Clamp index to valid range when items change
        const selectedIndex = items.length > 0 ? Math.min(rawIndex, items.length - 1) : 0

        const selectItem = useCallback((index: number) => {
            const item = items[index]
            if (item) command(item)
        }, [items, command])

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
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
        }), [items.length, selectItem, selectedIndex])

        if (items.length === 0) return null

        return (
            <div
                ref={listRef}
                className="bg-bg-secondary border border-border rounded-xl shadow-2xl overflow-y-auto overscroll-contain max-h-[280px] py-1 w-[320px]"
            >
                {items.map((item, index) => (
                    <button
                        key={item.videoId}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer border-none bg-transparent hover-trail ${
                            index === selectedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                        }`}
                        onClick={() => selectItem(index)}
                        onMouseEnter={() => setRawIndex(index)}
                    >
                        {item.thumbnailUrl && (
                            <img
                                src={item.thumbnailUrl}
                                alt=""
                                className="w-12 aspect-video object-cover rounded flex-shrink-0"
                            />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-text-primary truncate">{item.title}</div>
                            {item.channelTitle && (
                                <div className="text-[10px] text-text-tertiary truncate">{item.channelTitle}</div>
                            )}
                        </div>
                        {item.ownership === 'competitor' && (
                            <span className="text-[9px] text-text-tertiary bg-white/[0.06] px-1.5 py-0.5 rounded-full flex-shrink-0">
                                Competitor
                            </span>
                        )}
                    </button>
                ))}
            </div>
        )
    }
)

VideoSuggestionList.displayName = 'VideoSuggestionList'
