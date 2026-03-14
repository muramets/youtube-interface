import React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import clsx from 'clsx'

export interface RichTextViewerProps {
    content: string
    className?: string
}

const markdownComponents: Components = {
    h1: ({ className, style, children }) => (
        <h1 className={clsx("text-base font-bold mb-2 mt-4 first:mt-0 text-text-secondary hover:text-text-primary transition-colors duration-200 [&_strong]:!text-inherit", className)} style={style}>{children}</h1>
    ),
    h2: ({ className, style, children }) => (
        <h2 className={clsx("text-sm font-bold mb-2 mt-4 text-text-secondary hover:text-text-primary transition-colors duration-200 [&_strong]:!text-inherit", className)} style={style}>{children}</h2>
    ),
    h3: ({ className, style, children }) => (
        <h3 className={clsx("text-xs font-bold mb-1 mt-3 text-text-secondary hover:text-text-primary transition-colors duration-200 [&_strong]:!text-inherit", className)} style={style}>{children}</h3>
    ),
    h4: ({ className, style, children }) => (
        <h4 className={clsx("text-[11px] font-bold mb-1 mt-2 text-text-secondary hover:text-text-primary transition-colors duration-200 [&_strong]:!text-inherit", className)} style={style}>{children}</h4>
    ),
    h5: ({ className, style, children }) => (
        <h5 className={clsx("text-[10px] font-bold mb-1 mt-2 text-text-secondary hover:text-text-primary transition-colors duration-200 [&_strong]:!text-inherit", className)} style={style}>{children}</h5>
    ),
    h6: ({ className, style, children }) => (
        <h6 className={clsx("text-[9px] font-bold mb-1 mt-2 text-text-secondary hover:text-text-primary transition-colors duration-200 [&_strong]:!text-inherit", className)} style={style}>{children}</h6>
    ),
    p: ({ className, style, children }) => (
        <p className={clsx("mb-1 last:mb-0 text-left", className)} style={style}>{children}</p>
    ),
    div: ({ className, style, children }) => (
        <div className={className} style={style}>{children}</div>
    ),
    ul: ({ className, style, children }) => (
        <ul className={clsx("list-disc list-outside pl-5 mb-1 space-y-0.5", className)} style={style}>{children}</ul>
    ),
    ol: ({ className, style, children }) => (
        <ol className={clsx("list-decimal list-outside pl-5 mb-1 space-y-0.5", className)} style={style}>{children}</ol>
    ),
    li: ({ className, style, children }) => (
        <li className={clsx("pl-1 marker:text-text-secondary", className)} style={style}>
            {children}
        </li>
    ),
    strong: ({ className, style, children }) => (
        <strong className={clsx("font-bold text-text-primary", className)} style={style}>{children}</strong>
    ),
    em: ({ className, style, children }) => (
        <em className={clsx("italic text-text-primary/80", className)} style={style}>{children}</em>
    ),
    code: ({ className, style, children }) => (
        <code className={clsx("bg-text-secondary/20 rounded px-1 py-0.5 text-[10px] font-mono text-text-primary", className)} style={style}>{children}</code>
    ),
    blockquote: ({ className, style, children }) => (
        <blockquote className={clsx("border-l-2 border-accent/50 pl-3 italic text-text-secondary my-2", className)} style={style}>{children}</blockquote>
    ),
    hr: ({ className, style }) => (
        <hr className={clsx("my-4 border-t border-border w-full", className)} style={style} />
    ),
}

export const RichTextViewer = React.memo(({ content, className }: RichTextViewerProps) => {
    return (
        <div className={clsx(
            "rich-text-viewer prose prose-invert prose-sm max-w-none",
            "text-text-secondary font-mono text-xs leading-relaxed",
            "select-text cursor-text bg-transparent",
            "selection:bg-accent/80 selection:text-text-primary",
            className
        )}>
            <ReactMarkdown rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                {content}
            </ReactMarkdown>
        </div>
    )
})
