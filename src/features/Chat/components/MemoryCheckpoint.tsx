// =============================================================================
// AI CHAT: Memory Checkpoint — Inline expandable marker in chat timeline
//
// Premium design: collapsible sections (headers collapsed by default),
// hover-trail animations, accent color scheme.
// =============================================================================

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Brain, ChevronDown, Pencil, Check, X } from 'lucide-react';
import type { ConversationMemory } from '../../../core/types/chat/chat';
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor';
import { ConfirmDeleteButton } from '../../../components/ui/atoms/ConfirmDeleteButton';
import { CollapsibleMarkdownSections } from '../../Knowledge/components/CollapsibleMarkdownSections';
import { linkifyVideoIds } from '../../../core/utils/linkifyVideoIds';
import { useVideosCatalog } from '../../../core/hooks/useVideosCatalog';
import type { KiPreviewData } from '../../../components/ui/organisms/RichTextEditor/types';
import type { VideoPreviewData } from '../../Video/types';

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

    const linkifiedContent = useMemo(
        () => videoMap ? linkifyVideoIds(memory.content, videoMap) : memory.content,
        [memory.content, videoMap],
    );

    useEffect(() => {
        if (isExpanded && rootRef.current) {
            requestAnimationFrame(() => {
                rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
                    className="mt-1.5 mx-auto max-w-[90%] rounded-lg p-3 animate-memory-expand bg-surface-secondary"
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
                                <div className="text-left">
                                    <CollapsibleMarkdownSections
                                        content={linkifiedContent}
                                        videoMap={videoMap}
                                        kiMap={kiMap}
                                        defaultOpenLevel={0}
                                    />
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
