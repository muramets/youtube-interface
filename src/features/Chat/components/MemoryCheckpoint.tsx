// =============================================================================
// AI CHAT: Memory Checkpoint — Inline expandable marker in chat timeline
//
// Premium design: collapsible sections (headers collapsed by default),
// hover-trail animations, accent color scheme.
// =============================================================================

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Brain, ChevronDown, Pencil, Check, X } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import clsx from 'clsx';
import type { ConversationMemory } from '../../../core/types/chat/chat';
import { MemoryVideoChips } from './MemoryVideoChips';
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor';
import { CollapsibleSection } from '../../../components/ui/molecules/CollapsibleSection';
import { ConfirmDeleteButton } from '../../../components/ui/atoms/ConfirmDeleteButton';
import { parseMarkdownSections, type HierarchicalSection } from '../../Knowledge/utils/markdownSections';

// --- Markdown components (matches KnowledgeCard body style) ---

const bodyComponents: Components = {
    h1: ({ className, style, children }) => <h1 className={clsx('text-sm font-bold mb-2 mt-4 first:mt-0 text-text-secondary', className)} style={style}>{children}</h1>,
    h2: ({ className, style, children }) => <h2 className={clsx('text-xs font-bold mb-2 mt-3 text-text-secondary', className)} style={style}>{children}</h2>,
    h3: ({ className, style, children }) => <h3 className={clsx('text-[11px] font-bold mb-1 mt-2 text-text-secondary', className)} style={style}>{children}</h3>,
    p: ({ className, style, children }) => <p className={clsx('mb-1 last:mb-0 text-xs text-text-secondary leading-relaxed', className)} style={style}>{children}</p>,
    ul: ({ className, style, children }) => <ul className={clsx('list-disc list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary', className)} style={style}>{children}</ul>,
    ol: ({ className, style, children }) => <ol className={clsx('list-decimal list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary', className)} style={style}>{children}</ol>,
    li: ({ className, style, children }) => <li className={clsx('pl-1 marker:text-text-tertiary', className)} style={style}>{children}</li>,
    strong: ({ className, style, children }) => <strong className={clsx('font-bold text-text-primary', className)} style={style}>{children}</strong>,
    code: ({ className, style, children }) => <code className={clsx('bg-bg-primary rounded px-1 py-0.5 text-[10px] font-mono text-text-primary', className)} style={style}>{children}</code>,
    blockquote: ({ className, style, children }) => <blockquote className={clsx('border-l-2 border-accent/50 pl-3 my-2 text-text-secondary italic', className)} style={style}>{children}</blockquote>,
    hr: ({ className, style }) => <hr className={clsx('my-3 border-none h-px bg-border', className)} style={style} />,
    table: ({ className, style, children }) => <table className={clsx('border-collapse w-full my-2 text-[11px]', className)} style={style}>{children}</table>,
    th: ({ className, style, children }) => <th className={clsx('border border-border p-1.5 text-left font-semibold bg-bg-primary/50 text-text-primary', className)} style={style}>{children}</th>,
    td: ({ className, style, children }) => <td className={clsx('border border-border p-1.5 text-text-secondary', className)} style={style}>{children}</td>,
};

const headerComponents: Components = {
    h1: ({ className, style, children }) => <h1 className={clsx('text-sm font-bold text-inherit', className)} style={style}>{children}</h1>,
    h2: ({ className, style, children }) => <h2 className={clsx('text-xs font-bold text-inherit', className)} style={style}>{children}</h2>,
    h3: ({ className, style, children }) => <h3 className={clsx('text-[11px] font-bold text-inherit', className)} style={style}>{children}</h3>,
    h4: ({ className, style, children }) => <h4 className={clsx('text-[10px] font-bold text-inherit', className)} style={style}>{children}</h4>,
    p: ({ children }) => <span className="inline">{children}</span>,
    strong: ({ children }) => <strong className="font-bold text-inherit">{children}</strong>,
};

const HEADER_SIZE: Record<number, string> = {
    1: '[&_button]:text-sm',
    2: '[&_button]:text-xs',
    3: '[&_button]:text-[11px]',
    4: '[&_button]:text-[10px]',
};

const INDENT: Record<number, string> = {
    1: 'pl-0',
    2: 'pl-5',
    3: 'pl-5',
    4: 'pl-5',
};

// --- Component ---

interface MemoryCheckpointProps {
    memory: ConversationMemory;
    onUpdate: (memoryId: string, content: string) => Promise<void>;
    onDelete: (memoryId: string) => Promise<void>;
}

export const MemoryCheckpoint: React.FC<MemoryCheckpointProps> = ({ memory, onUpdate, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(memory.content);
    const [isSaving, setIsSaving] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const sections = useMemo(() => parseMarkdownSections(memory.content), [memory.content]);

    useEffect(() => {
        if (isExpanded && rootRef.current) {
            requestAnimationFrame(() => {
                rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }, [isExpanded]);

    const handleSave = useCallback(async () => {
        if (!editText.trim() || editText === memory.content) {
            setIsEditing(false);
            setEditText(memory.content);
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(memory.id, editText.trim());
            setIsEditing(false);
        } finally {
            setIsSaving(false);
        }
    }, [editText, memory.content, memory.id, onUpdate]);

    const handleDelete = useCallback(async () => {
        setIsSaving(true);
        try {
            await onDelete(memory.id);
        } finally {
            setIsSaving(false);
        }
    }, [memory.id, onDelete]);

    const handleCancel = useCallback(() => {
        setIsEditing(false);
        setEditText(memory.content);
    }, [memory.content]);

    const renderSection = (section: HierarchicalSection, idx: number) => (
        <CollapsibleSection
            key={idx}
            defaultOpen={false}
            variant="mini"
            title={
                <div className="inline-block pointer-events-none">
                    <ReactMarkdown rehypePlugins={[rehypeRaw]} components={headerComponents}>
                        {section.title}
                    </ReactMarkdown>
                </div>
            }
            className={clsx(
                'mb-3',
                '[&_button]:items-start [&_button]:text-left [&_button_div:first-child]:mt-[5px]',
                '[&>div:first-child]:!mb-0',
                INDENT[section.level] ?? 'pl-5',
                HEADER_SIZE[section.level] ?? '[&_button]:text-xs',
            )}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={bodyComponents}>
                {section.content.join('\n')}
            </ReactMarkdown>
            {section.children.length > 0 && (
                <div className="mt-2">
                    {section.children.map((child, i) => renderSection(child, i))}
                </div>
            )}
        </CollapsibleSection>
    );

    return (
        <div className="my-1" ref={rootRef}>
            {/* Divider line with checkpoint label */}
            <button
                className="w-full flex items-center gap-2 group cursor-pointer bg-transparent border-none p-0 hover-trail"
                onClick={() => setIsExpanded(v => !v)}
            >
                <div className="flex-1 h-px" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }} />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors group-hover:bg-white/[0.03]"
                    style={{ color: 'var(--accent)' }}
                >
                    <Brain size={12} />
                    <span className="font-medium truncate max-w-[200px]">{memory.conversationTitle}</span>
                    <ChevronDown
                        size={12}
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </div>
                <div className="flex-1 h-px" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }} />
            </button>

            {/* Expandable content */}
            {isExpanded && (
                <div
                    className="mt-1.5 mx-auto max-w-[90%] rounded-lg p-3 animate-memory-expand"
                    style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))',
                    }}
                >
                    {memory.videoRefs && memory.videoRefs.length > 0 && (
                        <MemoryVideoChips videoRefs={memory.videoRefs} />
                    )}
                    {isEditing ? (
                        <>
                            <RichTextEditor
                                value={editText}
                                onChange={setEditText}
                                placeholder="Edit memory..."
                            />
                            <div className="flex items-center justify-end gap-1.5 mt-2">
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
                                    onClick={handleCancel}
                                    disabled={isSaving}
                                >
                                    <X size={12} /> Cancel
                                </button>
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-transparent border-none cursor-pointer hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                                    style={{ color: 'var(--accent)' }}
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    <Check size={12} /> Save
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div
                                className="cursor-pointer"
                                onDoubleClick={() => {
                                    setIsEditing(true);
                                    requestAnimationFrame(() => {
                                        rootRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
                                    });
                                }}
                            >
                                {/* Collapsible sections — headers collapsed by default */}
                                <div className="text-left">
                                    {sections.preamble && (
                                        <div className="mb-3">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={bodyComponents}>
                                                {sections.preamble}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                    {sections.sections.map((section, idx) => renderSection(section, idx))}
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-1 mt-2">
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
                                    onClick={() => {
                                        setIsEditing(true);
                                        requestAnimationFrame(() => {
                                            rootRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
                                        });
                                    }}
                                >
                                    <Pencil size={11} /> Edit
                                </button>
                                <ConfirmDeleteButton
                                    onConfirm={handleDelete}
                                    size={11}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
