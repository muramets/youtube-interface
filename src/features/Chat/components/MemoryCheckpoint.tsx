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
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import clsx from 'clsx';
import type { ConversationMemory } from '../../../core/types/chat/chat';
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor';
import { CollapsibleSection } from '../../../components/ui/molecules/CollapsibleSection';
import { ConfirmDeleteButton } from '../../../components/ui/atoms/ConfirmDeleteButton';
import { parseMarkdownSections, type HierarchicalSection } from '../../Knowledge/utils/markdownSections';
import { buildBodyComponents } from '../../Knowledge/utils/bodyComponents';
import { linkifyVideoIds } from '../../../core/utils/linkifyVideoIds';
import { useVideosCatalog } from '../../../core/hooks/useVideosCatalog';
import type { KiPreviewData } from '../../../components/ui/organisms/RichTextEditor/types';
import type { VideoPreviewData } from '../../Video/types';

const sanitizeSchema = {
    ...defaultSchema,
    protocols: { ...defaultSchema.protocols, href: [...(defaultSchema.protocols?.href ?? []), 'vid', 'mention', 'ki'] },
    attributes: { ...defaultSchema.attributes, a: [...(defaultSchema.attributes?.a ?? []), 'className', 'class'], span: [...(defaultSchema.attributes?.span ?? []), 'className', 'class'] },
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
    onUpdate: (memoryId: string, content: string, title?: string) => Promise<void>;
    onDelete: (memoryId: string) => Promise<void>;
    knowledgeCatalog: KiPreviewData[];
}

export const MemoryCheckpoint: React.FC<MemoryCheckpointProps> = ({ memory, onUpdate, onDelete, knowledgeCatalog }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(memory.content);
    const [editTitle, setEditTitle] = useState(memory.conversationTitle);
    const [isSaving, setIsSaving] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const videoCatalog = useVideosCatalog();
    const videoMap = useMemo(() => {
        if (!videoCatalog.length) return undefined;
        const map = new Map<string, VideoPreviewData>();
        for (const v of videoCatalog) {
            map.set(v.videoId, v);
            if (v.youtubeVideoId && v.youtubeVideoId !== v.videoId) map.set(v.youtubeVideoId, v);
        }
        return map;
    }, [videoCatalog]);

    const kiMap = useMemo(() => {
        if (!knowledgeCatalog.length) return undefined;
        const map = new Map<string, (typeof knowledgeCatalog)[0]>();
        for (const ki of knowledgeCatalog) map.set(ki.id, ki);
        return map;
    }, [knowledgeCatalog]);

    const bodyComponents = useMemo(() => buildBodyComponents(videoMap, 'compact', kiMap), [videoMap, kiMap]);

    const sections = useMemo(() => {
        const content = videoMap ? linkifyVideoIds(memory.content, videoMap) : memory.content
        return parseMarkdownSections(content)
    }, [memory.content, videoMap]);

    useEffect(() => {
        if (isExpanded && rootRef.current) {
            requestAnimationFrame(() => {
                rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }, [isExpanded]);

    const handleSave = useCallback(async () => {
        const trimmedTitle = editTitle.trim() || 'Untitled';
        const contentChanged = editText.trim() !== memory.content;
        const titleChanged = trimmedTitle !== memory.conversationTitle;
        if (!editText.trim() || (!contentChanged && !titleChanged)) {
            setIsEditing(false);
            setEditText(memory.content);
            setEditTitle(memory.conversationTitle);
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(memory.id, editText.trim(), titleChanged ? trimmedTitle : undefined);
            setIsEditing(false);
        } finally {
            setIsSaving(false);
        }
    }, [editText, editTitle, memory.content, memory.conversationTitle, memory.id, onUpdate]);

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
        setEditTitle(memory.conversationTitle);
    }, [memory.content, memory.conversationTitle]);

    const renderSection = (section: HierarchicalSection, idx: number) => (
        <CollapsibleSection
            key={idx}
            defaultOpen={false}
            variant="mini"
            title={
                <div className="inline-block pointer-events-none">
                    <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} components={headerComponents}>
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
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={url => url} components={bodyComponents}>
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
                <div className="flex-1 h-px bg-accent/25" />
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
                <div className="flex-1 h-px bg-accent/25" />
            </button>

            {/* Expandable content */}
            {isExpanded && (
                <div
                    className="mt-1.5 mx-auto max-w-[90%] rounded-lg p-3 animate-memory-expand bg-bg-secondary"
                >
                    {isEditing ? (
                        <>
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Memory title"
                                className="w-full bg-transparent text-sm font-medium text-text-primary outline-none border-b border-border px-0 py-1 mb-2 placeholder-text-text-tertiary focus:border-accent transition-colors"
                                autoFocus
                            />
                            <RichTextEditor
                                value={editText}
                                onChange={setEditText}
                                placeholder="Edit memory..."
                                knowledgeCatalog={knowledgeCatalog}
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
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={url => url} components={bodyComponents}>
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
