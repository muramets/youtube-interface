import { useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { SlashCommandItem } from '../constants/slashCommands'

export interface SlashCommandListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashCommandListProps {
    items: SlashCommandItem[]
    command: (item: SlashCommandItem) => void
}

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
    ({ items, command }, ref) => {
        const [rawIndex, setRawIndex] = useState(0)

        // Clamp index to valid range when items change (no useEffect needed)
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
            <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl overflow-y-auto overscroll-none max-h-[320px] py-1 w-[200px]">
                {items.map((item, index) => (
                    <button
                        key={item.label}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer border-none bg-transparent ${
                            index === selectedIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                        }`}
                        onClick={() => selectItem(index)}
                        onMouseEnter={() => setRawIndex(index)}
                    >
                        <span className="text-text-secondary flex-shrink-0">{item.icon}</span>
                        <span className="text-xs text-text-primary">{item.label}</span>
                    </button>
                ))}
            </div>
        )
    }
)

SlashCommandList.displayName = 'SlashCommandList'
