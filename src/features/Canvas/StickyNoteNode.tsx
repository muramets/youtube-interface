// =============================================================================
// CANVAS: StickyNoteNode — skeuomorphic sticky note with editable content.
// Color picker on hover, contentEditable text.
// =============================================================================

import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { StickyNoteData, NoteColor } from '../../core/types/canvas';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';

// --- Color palette ---

const NOTE_COLORS: Record<NoteColor, { bg: string; shadow: string; text: string }> = {
    yellow: { bg: '#FEF3C7', shadow: '#F59E0B', text: '#78350F' },
    pink: { bg: '#FCE7F3', shadow: '#EC4899', text: '#831843' },
    blue: { bg: '#DBEAFE', shadow: '#3B82F6', text: '#1E3A5F' },
    green: { bg: '#D1FAE5', shadow: '#10B981', text: '#064E3B' },
    neutral: { bg: '#F3F4F6', shadow: '#9CA3AF', text: '#374151' },
};

const COLOR_OPTIONS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'neutral'];

interface StickyNoteNodeProps {
    data: StickyNoteData;
    nodeId: string;
}

const StickyNoteNodeInner: React.FC<StickyNoteNodeProps> = ({ data, nodeId }) => {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData);
    const [isEditing, setIsEditing] = useState(false);
    const [hovered, setHovered] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const colors = NOTE_COLORS[data.color] || NOTE_COLORS.yellow;

    // Sync content from store to editable
    useEffect(() => {
        if (contentRef.current && !isEditing) {
            contentRef.current.textContent = data.content || '';
        }
    }, [data.content, isEditing]);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        const text = contentRef.current?.textContent ?? '';
        if (text !== data.content) {
            updateNodeData(nodeId, { content: text });
        }
    }, [nodeId, data.content, updateNodeData]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        // Focus and place cursor at end
        setTimeout(() => {
            const el = contentRef.current;
            if (!el) return;
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }, 0);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Prevent canvas keyboard shortcuts while editing
        e.stopPropagation();
        if (e.key === 'Escape') {
            contentRef.current?.blur();
        }
    }, []);

    const handleColorChange = useCallback((color: NoteColor) => {
        updateNodeData(nodeId, { color });
    }, [nodeId, updateNodeData]);

    return (
        <div
            ref={rootRef}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onDoubleClick={handleDoubleClick}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                minHeight: 160,
                background: colors.bg,
                borderRadius: 2,
                padding: '28px 14px 14px',
                boxShadow: `
                    0 1px 3px rgba(0,0,0,0.12),
                    0 4px 8px rgba(0,0,0,0.06),
                    inset 0 -2px 4px rgba(0,0,0,0.04)
                `,
                overflow: 'hidden',
                cursor: isEditing ? 'text' : 'default',
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
            }} />

            {/* Content */}
            <div
                ref={contentRef}
                contentEditable={isEditing}
                suppressContentEditableWarning
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                style={{
                    outline: 'none',
                    color: colors.text,
                    fontSize: 13,
                    lineHeight: 1.5,
                    minHeight: 40,
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                    userSelect: isEditing ? 'text' : 'none',
                }}
            />

            {/* Placeholder */}
            {!data.content && !isEditing && (
                <div style={{
                    position: 'absolute',
                    top: 28,
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

            {/* Color picker dots — bottom-right on hover, hidden during resize via CSS */}
            {hovered && !isEditing && (
                <div className="sticky-color-picker" style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 6,
                    display: 'flex',
                    gap: 3,
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
