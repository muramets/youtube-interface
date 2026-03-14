import React from 'react'
import clsx from 'clsx'

/**
 * MenuButton Component
 *
 * Reusable toolbar button with tooltip and active state styling.
 * Used throughout the RichTextEditor toolbar for formatting actions.
 */

interface MenuButtonProps {
    /** Click handler for the button */
    onClick: () => void
    /** Whether the button represents an active state (e.g., bold is active) */
    isActive?: boolean
    /** Whether the button is disabled */
    disabled?: boolean
    /** Tooltip text shown on hover */
    tooltip?: string
    /** Icon or content to display in the button */
    children: React.ReactNode
}

export const MenuButton = ({
    onClick,
    isActive,
    disabled,
    tooltip,
    children
}: MenuButtonProps) => (
    <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        title={tooltip}
        aria-label={tooltip}
        aria-pressed={isActive}
        aria-disabled={disabled}
        className={clsx(
            "p-1.5 rounded transition-colors",
            isActive
                ? "bg-accent/20 text-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-hover-bg",
            disabled && "opacity-30 cursor-not-allowed"
        )}
    >
        {children}
    </button>
)
