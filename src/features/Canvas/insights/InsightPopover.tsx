// =============================================================================
// InsightPopover — small floating text editor for a single insight category.
// Auto-saves on blur. Pin toggle included.
// =============================================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import type { InsightCategory, NodeInsight } from '../../../core/types/canvas';
import { INSIGHT_CATEGORY_MAP as CATEGORY_META } from '../constants/insightCategories';

interface InsightPopoverProps {
    category: InsightCategory;
    insight?: NodeInsight;
    onSave: (category: InsightCategory, text: string, pinned: boolean) => void;
    onClose: () => void;
}

export const InsightPopover: React.FC<InsightPopoverProps> = React.memo(({ category, insight, onSave, onClose }) => {
    const meta = CATEGORY_META[category];
    const textRef = useRef<HTMLTextAreaElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [pinned, setPinned] = useState(insight?.pinned ?? false);
    const pinnedRef = useRef(pinned);
    /** Guard: ensures save() runs at most once per popover session */
    const hasSavedRef = useRef(false);

    // Focus textarea on mount
    useEffect(() => {
        const el = textRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, []);

    // Close on click outside
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                save();
                onClose();
            }
        };
        // Delay to avoid immediate close from the click that opened us
        const timer = setTimeout(() => document.addEventListener('mousedown', handle), 50);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', handle); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const save = useCallback(() => {
        if (hasSavedRef.current) return;
        hasSavedRef.current = true;
        const text = textRef.current?.value.trim() ?? '';
        onSave(category, text, pinnedRef.current);
    }, [category, onSave]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            save();
            onClose();
        }
    }, [save, onClose]);

    const togglePin = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setPinned(prev => {
            const next = !prev;
            pinnedRef.current = next; // Update ref synchronously for save()
            // Save immediately with new pin state
            const text = textRef.current?.value.trim() ?? '';
            onSave(category, text, next);
            return next;
        });
    }, [category, onSave]);

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            className="insight-popover bg-bg-secondary/90 backdrop-blur-md outline-none"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{
                position: 'absolute',
                left: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                marginLeft: 8,
                width: 220,
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                zIndex: 100,
                animation: 'insightPopoverIn 0.15s ease-out',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
            }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <meta.Icon size={13} strokeWidth={2} /> {meta.label}
                </span>
                <button
                    onClick={togglePin}
                    onMouseDown={(e) => e.preventDefault()}
                    className={`flex items-center justify-center w-[22px] h-[22px] rounded-md border-none transition-all duration-150 cursor-pointer ${pinned
                        ? 'hover:brightness-125'
                        : 'hover:bg-white/10 text-white/40 hover:text-white/80'
                        }`}
                    style={{
                        background: pinned ? `${meta.color}22` : 'transparent',
                        color: pinned ? meta.color : undefined,
                        padding: 0,
                    }}
                    title={pinned ? 'Unpin' : 'Pin to card'}
                >
                    {pinned ? <Pin size={12} /> : <PinOff size={12} />}
                </button>
            </div>

            <textarea
                ref={textRef}
                defaultValue={insight?.text ?? ''}
                onKeyDown={handleKeyDown}
                onBlur={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && rootRef.current?.contains(related)) return;
                    save();
                    onClose();
                }}
                placeholder="Write insight..."
                rows={3}
                style={{
                    width: '100%',
                    resize: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    color: '#E2E8F0',
                    fontSize: 12,
                    lineHeight: 1.5,
                    padding: '6px 8px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                }}
            />
        </div>
    );
});
InsightPopover.displayName = 'InsightPopover';
