// =============================================================================
// CANVAS: StickyNoteNode — skeuomorphic sticky note with editable content.
// Compact mode (default): fixed height, scrollable content.
// Expanded mode: auto-height showing all content.
// Markdown rendering in view mode via ReactMarkdown.
// TipTap WYSIWYG editor in edit mode (double-click to enter).
// Color picker on hover.
// =============================================================================

import React, { useRef, useCallback, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { StickyNoteData, NoteColor } from '../../../core/types/canvas';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { StickyNoteEditor } from './StickyNoteEditor/StickyNoteEditor';

// --- Color palette ---

const NOTE_COLORS: Record<NoteColor, { bg: string; shadow: string; text: string }> = {
    yellow: { bg: '#FEF3C7', shadow: '#F59E0B', text: '#78350F' },
    pink: { bg: '#FCE7F3', shadow: '#EC4899', text: '#831843' },
    red: { bg: '#FEE2E2', shadow: '#EF4444', text: '#7F1D1D' },
    blue: { bg: '#DBEAFE', shadow: '#3B82F6', text: '#1E3A5F' },
    green: { bg: '#D1FAE5', shadow: '#10B981', text: '#064E3B' },
    neutral: { bg: '#F3F4F6', shadow: '#9CA3AF', text: '#374151' },
};

const COLOR_OPTIONS: NoteColor[] = ['yellow', 'pink', 'red', 'blue', 'green', 'neutral'];

/** Padding above (tape strip) + below content */
const CONTENT_PAD_TOP = 28;
const CONTENT_PAD_BOTTOM = 14;

interface StickyNoteNodeProps {
    data: StickyNoteData;
    nodeId: string;
}

/** Format date as '25 FEB' (current year) or '25 FEB 2025' (other years) */
function formatNoteDate(date: Date): string {
    const day = date.getDate();
    const month = date.toLocaleString('en', { month: 'short' }).toUpperCase();
    const year = date.getFullYear();
    if (year === new Date().getFullYear()) return `${day} ${month}`;
    return `${day} ${month} ${year}`;
}

const StickyNoteNodeInner: React.FC<StickyNoteNodeProps> = ({ data, nodeId }) => {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData);
    const setEditingNodeId = useCanvasStore((s) => s.setEditingNodeId);
    const updatedAt = useCanvasStore((s) => {
        const node = s.nodes.find((n) => n.id === nodeId);
        return node?.updatedAt ?? node?.createdAt;
    });
    const [isEditing, setIsEditing] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const colors = NOTE_COLORS[data.color] || NOTE_COLORS.yellow;
    const isExpanded = data.isExpanded ?? false;

    // Detect content overflow in compact mode
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || isEditing || isExpanded) {
            requestAnimationFrame(() => setIsOverflowing(false));
            return;
        }
        requestAnimationFrame(() => {
            setIsOverflowing(el.scrollHeight > el.clientHeight + 2);
        });
    }, [data.content, isExpanded, isEditing]);

    // Native wheel event handler — stops propagation to canvas zoom/pan
    // Must be native because canvas uses native addEventListener('wheel', ...)
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const stop = (e: WheelEvent) => {
            // Only intercept if content is scrollable
            if (el.scrollHeight > el.clientHeight) {
                e.stopPropagation();
            }
        };
        el.addEventListener('wheel', stop, { passive: true });
        return () => el.removeEventListener('wheel', stop);
    }, [isEditing, isExpanded]);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        setEditingNodeId(null);
    }, [setEditingNodeId]);

    // Real-time Markdown sync from TipTap editor
    // No guard against identical content — useMarkdownSync already deduplicates
    const handleEditorChange = useCallback((markdown: string) => {
        updateNodeData(nodeId, { content: markdown });
    }, [nodeId, updateNodeData]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isEditing) return;
        setIsEditing(true);
        setEditingNodeId(nodeId);
    }, [isEditing, nodeId, setEditingNodeId]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
    }, []);

    const handleColorChange = useCallback((color: NoteColor) => {
        updateNodeData(nodeId, { color });
    }, [nodeId, updateNodeData]);

    const toggleExpand = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        updateNodeData(nodeId, { isExpanded: !isExpanded });
    }, [nodeId, isExpanded, updateNodeData]);

    return (
        <div
            ref={rootRef}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onMouseDown={(e) => { if (isEditing) e.stopPropagation(); }}
            onDoubleClick={handleDoubleClick}
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                width: '100%',
                height: isExpanded ? 'auto' : '100%',
                background: colors.bg,
                borderRadius: 2,
                overflow: 'hidden',
                cursor: isEditing ? 'text' : 'default',
                boxShadow: `
                    0 1px 3px rgba(0,0,0,0.12),
                    0 4px 8px rgba(0,0,0,0.06),
                    inset 0 -2px 4px rgba(0,0,0,0.04)
                `,
            }}
        >
            {/* Tape strip */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 48,
                height: 14,
                background: 'rgba(255,255,255,0.5)',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                borderRadius: '0 0 2px 2px',
                zIndex: 3,
            }} />

            {/* === Scrollable content area === */}
            {!isEditing && (
                <div
                    ref={scrollRef}
                    className="sticky-note-scroll"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flexGrow: 1,
                        padding: `${CONTENT_PAD_TOP}px 14px ${CONTENT_PAD_BOTTOM}px`,
                        height: isExpanded ? 'auto' : '100%',
                        boxSizing: 'border-box',
                        overflowY: isExpanded ? 'visible' : 'auto',
                        overflowX: 'hidden',
                    }}
                >
                    <div className="sticky-note-prose" style={{
                        color: colors.text,
                        fontSize: 13,
                        lineHeight: 1.5,
                        minHeight: 20,
                        wordBreak: 'break-word',
                        userSelect: 'text',
                    }}>
                        {data.content ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                {data.content}
                            </ReactMarkdown>
                        ) : null}
                    </div>
                </div>
            )}

            {/* === Edit mode: TipTap WYSIWYG editor === */}
            {isEditing && (
                <div
                    onKeyDown={handleKeyDown}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flexGrow: 1,
                        padding: `${CONTENT_PAD_TOP}px 14px ${CONTENT_PAD_BOTTOM}px`,
                        boxSizing: 'border-box',
                    }}
                >
                    <StickyNoteEditor
                        value={data.content || ''}
                        onChange={handleEditorChange}
                        onBlur={handleBlur}
                        textColor={colors.text}
                    />
                </div>
            )}

            {/* Placeholder */}
            {!data.content && !isEditing && (
                <div style={{
                    position: 'absolute',
                    top: CONTENT_PAD_TOP,
                    left: 14,
                    right: 14,
                    color: colors.text,
                    opacity: 0.35,
                    fontSize: 13,
                    lineHeight: 1.5,
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}>Double-click to type...</div>
            )}

            {/* Fade gradient — pinned to bottom of root, NOT inside scroll area */}
            {!isExpanded && isOverflowing && !isEditing && (
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 28,
                    background: `linear-gradient(transparent, ${colors.bg})`,
                    pointerEvents: 'none',
                    zIndex: 2,
                }} />
            )}

            {/* Expand/Collapse toggle — pinned to root bottom */}
            {(isOverflowing || isExpanded) && !isEditing && (
                <button
                    onClick={toggleExpand}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        bottom: 2,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 16,
                        borderRadius: 8,
                        background: `${colors.shadow}22`,
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        opacity: hovered ? 1 : 0.4,
                        transition: 'opacity 0.15s ease',
                        zIndex: 5,
                    }}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                >
                    {isExpanded
                        ? <ChevronUp size={12} color={colors.text} strokeWidth={2.5} />
                        : <ChevronDown size={12} color={colors.text} strokeWidth={2.5} />
                    }
                </button>
            )}

            {/* Timestamp — bottom-left, visible on hover */}
            {hovered && !isEditing && updatedAt && (
                <div style={{
                    position: 'absolute',
                    bottom: 6,
                    left: 10,
                    fontSize: 9,
                    color: colors.text,
                    opacity: 0.4,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    zIndex: 5,
                }}>
                    {formatNoteDate(updatedAt.toDate())}
                </div>
            )}

            {/* Color picker dots — pinned to root bottom-right */}
            {hovered && !isEditing && (
                <div className="sticky-color-picker" style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 6,
                    display: 'flex',
                    gap: 3,
                    zIndex: 5,
                }}>
                    {COLOR_OPTIONS.map((c) => (
                        <button
                            key={c}
                            className="sticky-color-dot"
                            onClick={(e) => { e.stopPropagation(); handleColorChange(c); }}
                            style={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                background: NOTE_COLORS[c].bg,
                                border: c === data.color
                                    ? `2px solid ${NOTE_COLORS[c].shadow}`
                                    : '1px solid rgba(0,0,0,0.15)',
                                cursor: 'pointer',
                                padding: 0,
                                transition: 'transform 0.1s',
                            }}
                            title={c}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const StickyNoteNode = React.memo(StickyNoteNodeInner);
StickyNoteNode.displayName = 'StickyNoteNode';
