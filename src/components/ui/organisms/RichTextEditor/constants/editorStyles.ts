import clsx from 'clsx'

/**
 * Tailwind CSS classes for the Tiptap editor prose styling.
 *
 * This configuration provides:
 * - Typography styles using Tailwind's prose plugin
 * - Dark mode color scheme (prose-invert)
 * - Custom heading hierarchy with indentation
 * - Table styling with premium look
 * - Code block and inline code styling
 * - List and divider customization
 *
 * Business Logic:
 * - Headers h4-h6 are collapsed by default (see CollapsableHeadings extension)
 * - Dynamic indentation creates IDE-like hierarchy (depth-1 through depth-6)
 * - Color inheritance ensures inline styles work with bold/strong tags
 */
export const EDITOR_PROSE_CLASSES = clsx(
    // Base prose configuration with size adjustment
    'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[100px] text-text-primary',

    // Restore default text colors using CSS variables to avoid inline style overrides
    '[--tw-prose-body:theme(colors.text-primary)]',
    '[--tw-prose-headings:theme(colors.text-primary)]',
    '[--tw-prose-links:theme(colors.accent)]',
    '[--tw-prose-bold:inherit]', // Ensure bold doesn't force a color
    '[--tw-prose-hr:theme(colors.border)]',

    // Base spacing for headings
    'prose-headings:mt-6 prose-headings:mb-2 prose-headings:leading-[1.3]',

    // List spacing
    'prose-ul:my-1 prose-ol:my-1',

    // Divider — override browser defaults (background + border) with design token
    '[&_hr]:border-none [&_hr]:h-px [&_hr]:bg-border [&_hr]:my-6',

    // Ensure headers have relative positioning for collapse arrow icons
    'prose-headings:relative',

    // Dynamic Indentation (IDE-like hierarchy)
    // Each depth level adds 1.5rem (24px) of left padding
    '[&_.depth-1]:pl-6',
    '[&_.depth-2]:pl-12',
    '[&_.depth-3]:pl-[4.5rem]',
    '[&_.depth-4]:pl-[6rem]',
    '[&_.depth-5]:pl-[7.5rem]',
    '[&_.depth-6]:pl-[9rem]',

    // Hide nav/toc if present in markdown
    'prose-nav:hidden',

    // Hide collapsed content (controlled by CollapsableHeadings extension)
    '[&_.collapsed-content]:hidden',

    // Fix for color + bold: enforce color inheritance for strong tags
    '[&_strong]:text-inherit',

    // Table styles — border-collapse with visible cell borders (matches chat table pattern)
    '[&_table]:border-collapse [&_table]:w-full [&_table]:my-4',
    '[&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:bg-bg-primary/50 [&_th]:text-text-primary',
    '[&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:text-sm [&_td]:text-text-primary',

    // Code block styles
    // 1. Remove backticks (apostrophes) added by typography plugin
    'prose-code:before:content-none prose-code:after:content-none',
    // 2. Inline code: high contrast background and inherited color
    'prose-code:bg-bg-primary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-text-primary prose-code:font-mono prose-code:tracking-wide [&_code]:text-inherit',
    // 3. Code blocks (pre): high contrast black background
    'prose-pre:bg-bg-primary prose-pre:text-text-primary prose-pre:font-mono prose-pre:tracking-wide [&_pre_code]:text-inherit',

    // Blockquote styles
    // Default: border-l-4, theme-border, padding, rounded, background.
    // Removed: italic, text-sub (text remains normal)
    // Removed: quote marks (before/after !content-none with important)
    'prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:pl-4 prose-blockquote:py-2 prose-blockquote:my-4 prose-blockquote:bg-text-secondary/5 prose-blockquote:rounded-r-md prose-blockquote:not-italic prose-blockquote:text-text-primary prose-blockquote:font-medium prose-blockquote:before:!content-none prose-blockquote:after:!content-none [&_blockquote_p]:before:!content-none [&_blockquote_p]:after:!content-none',
    // Support for custom border colors via inline styles
    '[&_blockquote[data-border-color]]:border-l-4',

    // Fix Quote Indentation:
    // Convert 'depth-X' padding (standard indent) to margin so the border moves with indent
    // Standard depth-X uses pl-6 (1.5rem steps). We use ml-X to move the border.
    // We must also reset pl to 4 (1rem) which is the internal padding of the quote.
    '[&_blockquote.depth-1]:pl-4 [&_blockquote.depth-1]:ml-6',
    '[&_blockquote.depth-2]:pl-4 [&_blockquote.depth-2]:ml-12',
    '[&_blockquote.depth-3]:pl-4 [&_blockquote.depth-3]:ml-[4.5rem]',
    '[&_blockquote.depth-4]:pl-4 [&_blockquote.depth-4]:ml-[6rem]',
    '[&_blockquote.depth-5]:pl-4 [&_blockquote.depth-5]:ml-[7.5rem]',
    '[&_blockquote.depth-6]:pl-4 [&_blockquote.depth-6]:ml-[9rem]'
)
