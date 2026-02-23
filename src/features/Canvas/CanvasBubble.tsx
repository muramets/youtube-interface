// =============================================================================
// CANVAS: Floating Bubble Button (FAB)
// Positioned to the left of ChatBubble using useFloatingBottomOffset.
// Supports drop zone indicator when Canvas is closed.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { useFloatingBottomOffset } from '../../core/hooks/useFloatingBottomOffset';
import { useAuth } from '../../core/hooks/useAuth';
import { useAppContextStore } from '../../core/stores/appContextStore';
import { useUIStore } from '../../core/stores/uiStore';
import './Canvas.css';

// Canvas FAB sits 56px to the left of Chat Bubble (48px button + 8px gap)
const CANVAS_FAB_OFFSET = 56;

export const CanvasBubble: React.FC = () => {
    const { isOpen, toggleOpen, addNode } = useCanvasStore(
        useShallow((s) => ({ isOpen: s.isOpen, toggleOpen: s.toggleOpen, addNode: s.addNode }))
    );
    const { user, isLoading } = useAuth();
    const { bottomPx, rightPx } = useFloatingBottomOffset();
    const { showToast } = useUIStore();

    // Delayed fade-in so bubble appears after page content settles
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setReady(true), 600);
        return () => clearTimeout(t);
    }, []);

    // Drop zone: track drag-over on FAB
    const [isDropActive, setIsDropActive] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        setIsDropActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) setIsDropActive(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const { items: contextItems, consumeItems } = useAppContextStore();

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDropActive(false);

        // If there are context items being dragged, add them as pending nodes
        if (contextItems.length > 0) {
            contextItems.forEach((item) => addNode(item));
            consumeItems();
            showToast('Added to Canvas', 'success');
        }
    };

    if (isLoading || !user) return null;
    // Hide FAB when canvas is open — toolbar has the close button
    if (isOpen) return null;

    // Horizontal: Chat is at rightPx, Canvas is CANVAS_FAB_OFFSET px to the left
    const rightValue = rightPx + CANVAS_FAB_OFFSET;

    return (
        <button
            className={`canvas-bubble fixed w-12 h-12 rounded-full border border-border cursor-pointer flex items-center justify-center bg-bg-secondary/90 backdrop-blur-md shadow-lg text-text-secondary transition-[bottom,transform,filter,opacity,box-shadow,border-color] duration-300 hover:brightness-125 active:scale-95 z-fab ${isOpen ? 'text-accent border-accent/50' : ''} ${isDropActive ? 'canvas-bubble-drop-active' : ''}`}
            style={{
                opacity: ready ? 1 : 0,
                pointerEvents: ready ? undefined : 'none',
                bottom: bottomPx,
                right: rightValue,
            }}
            onClick={toggleOpen}
            title="Canvas"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <LayoutGrid className="w-[20px] h-[20px]" />
        </button>
    );
};
