import { Editor } from '@tiptap/react'
import * as Popover from '@radix-ui/react-popover'
import { Droplet } from 'lucide-react'
import clsx from 'clsx'
import { PRESET_COLORS } from '../constants/colors'

/**
 * ColorPicker Component
 *
 * Popover-based color picker for text styling.
 * Displays preset colors and allows removing color formatting.
 */

interface ColorPickerProps {
    editor: Editor
}

export const ColorPicker = ({ editor }: ColorPickerProps) => {
    const currentColor = editor.getAttributes('textStyle').color

    /**
     * Checks if a color is currently active in the selection
     */
    const isColorActive = (c: string) => {
        if (!currentColor) return false
        const norm = (val: string) => val.toLowerCase().trim()
        return norm(currentColor) === norm(c)
    }

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Text Color"
                    title="Text Color"
                    className={clsx(
                        "p-1.5 rounded-md transition-colors text-text-secondary hover:text-text-primary hover:bg-hover-bg",
                        currentColor && "text-text-primary bg-text-secondary/10"
                    )}
                >
                    <div className="relative">
                        <Droplet size={16} />
                        {currentColor && (
                            <div
                                className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full"
                                style={{ backgroundColor: currentColor }}
                            />
                        )}
                    </div>
                </button>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    className="z-tooltip p-2 bg-bg-secondary border border-border rounded-xl shadow-2xl flex flex-col gap-2 min-w-[140px] animate-in fade-in zoom-in-95 duration-200"
                    sideOffset={5}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="grid grid-cols-5 gap-1.5">
                        {/* Reset color button */}
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().unsetMark('textStyle').run()}
                            className="w-5 h-5 rounded-full flex items-center justify-center border border-text-secondary/20 transition-transform hover:scale-125 hover:border-white/50 cursor-pointer relative"
                            title="Reset color"
                        >
                            <div className="w-full h-px bg-text-secondary/50 rotate-45 absolute" />
                        </button>

                        {/* Preset colors */}
                        {PRESET_COLORS.map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => editor.chain().focus().setColor(c).run()}
                                className={clsx(
                                    "w-5 h-5 rounded-full transition-transform hover:scale-125 hover:ring-2 hover:ring-white/30 cursor-pointer",
                                    isColorActive(c) && "ring-2 ring-white/50 scale-110"
                                )}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                    <Popover.Arrow className="fill-bg-secondary" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
