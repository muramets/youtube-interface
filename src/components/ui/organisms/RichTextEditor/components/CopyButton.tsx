import { useState } from 'react'
import clsx from 'clsx'
import { Copy, Check } from 'lucide-react'

/**
 * CopyButton Component
 *
 * Button that copies text to clipboard with visual feedback.
 * Used in the Debug Panel for copying HTML and JSON output.
 */

interface CopyButtonProps {
    /** Text to copy to clipboard */
    text: string
    /** Additional CSS classes */
    className?: string
}

export const CopyButton = ({ text, className }: CopyButtonProps) => {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <button
            onClick={handleCopy}
            className={clsx(
                "p-1.5 rounded-md transition-all duration-200 border",
                copied
                    ? "bg-green-500/20 border-green-500/50 text-green-400"
                    : "bg-white/5 border-border text-text-secondary hover:text-white hover:bg-white/10",
                className
            )}
            title="Copy to clipboard"
        >
            {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
    )
}
