// =============================================================================
// Chat Drag & Drop — file drop handling for ChatPanel
// =============================================================================

import { useCallback, useRef, useState } from 'react';

interface UseChatDragDropReturn {
    isDragOver: boolean;
    handleDragEnter: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
}

export function useChatDragDrop(
    addFiles: (files: File[]) => void,
): UseChatDragDropReturn {
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounterRef.current++;
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) setIsDragOver(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) addFiles(files);
    }, [addFiles]);

    return { isDragOver, handleDragEnter, handleDragLeave, handleDragOver, handleDrop };
}
