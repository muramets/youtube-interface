import { Editor } from '@tiptap/react'
import * as Popover from '@radix-ui/react-popover'
import { Quote, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { PRESET_COLORS } from '../constants/colors'

/**
 * QuoteColorPicker Component
 *
 * Popover-based color picker for blockquote border color.
 * Displays preset colors and allows resetting to theme default.
 *
 * Business Logic:
 * - Outside blockquote: Button creates a new blockquote (no popover)
 * - Inside blockquote: Button opens color picker popover for styling/removal
 */

interface QuoteColorPickerProps {
    editor: Editor
}

export const QuoteColorPicker = ({ editor }: QuoteColorPickerProps) => {
    const isInBlockquote = editor.isActive('blockquote')
    const borderColor = isInBlockquote
        ? editor.getAttributes('blockquote').borderColor
        : null

    /**
     * Checks if a color is currently active for the blockquote border
     */
    const isColorActive = (c: string) => {
        if (!borderColor) return false
        const norm = (val: string) => val.toLowerCase().trim()
        return norm(borderColor) === norm(c)
    }

    /**
     * Apply color to blockquote border
     */
    const applyColor = (color: string) => {
        if (!isInBlockquote) return
        editor.chain().focus().setBlockquoteBorderColor(color).run()
    }

    /**
     * Reset border color to theme default
     */
    const resetColor = () => {
        if (!isInBlockquote) return
        editor.chain().focus().setBlockquoteBorderColor('').run()
    }

    /**
     * Toggle blockquote on/off (used for creation)
     */
    const toggleBlockquote = () => {
        editor.chain().focus().toggleBlockquote().run()
    }

    /**
     * Remove blockquote completely (turn back to paragraph)
     */
    const removeBlockquote = () => {
        editor.chain().focus().unsetBlockquote().run()
    }

    // Common button styles
    const buttonClass = clsx(
        "p-1.5 rounded-md transition-colors text-text-secondary hover:text-text-primary hover:bg-hover-bg",
        isInBlockquote && "text-text-primary bg-text-secondary/10"
    )

    const buttonContent = (
        <div className="relative">
            <Quote size={16} />
            {borderColor && (
                <div
                    className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full"
                    style={{ backgroundColor: borderColor }}
                />
            )}
        </div>
    )

    // CASE 1: Outside Quote -> Simple Button to Create
    if (!isInBlockquote) {
        return (
            <button
                type="button"
                onClick={toggleBlockquote}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Create Quote"
                title="Quote"
                className={buttonClass}
            >
                {buttonContent}
            </button>
        )
    }

    // CASE 2: Inside Quote -> Popover for Styling
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Quote Styling"
                    title="Quote Color & Settings"
                    className={buttonClass}
                >
                    {buttonContent}
                </button>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    className="z-modal p-2 bg-bg-secondary border border-border rounded-xl shadow-2xl flex flex-col gap-2 min-w-[140px] animate-in fade-in zoom-in-95 duration-200"
                    sideOffset={5}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="grid grid-cols-5 gap-1.5">
                        {/* Reset color button */}
                        <button
                            type="button"
                            onClick={resetColor}
                            className="w-5 h-5 rounded-full flex items-center justify-center border border-text-secondary/20 transition-transform hover:scale-125 hover:border-white/50 cursor-pointer relative"
                            title="Reset to theme color"
                        >
                            <div className="w-full h-px bg-text-secondary/50 rotate-45 absolute" />
                        </button>

                        {/* Preset colors */}
                        {PRESET_COLORS.map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => applyColor(c)}
                                className={clsx(
                                    "w-5 h-5 rounded-full transition-transform hover:scale-125 hover:ring-2 hover:ring-white/30 cursor-pointer",
                                    isColorActive(c) && "ring-2 ring-white/50 scale-110"
                                )}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-white/5 w-full my-0.5" />

                    {/* Remove Quote Button */}
                    <button
                        onClick={removeBlockquote}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-hover-bg text-xs text-text-secondary hover:text-error transition-colors w-full"
                    >
                        <Trash2 size={12} />
                        <span>Remove Quote</span>
                    </button>

                    <Popover.Arrow className="fill-bg-secondary" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
