// =============================================================================
// useCanvasSync — Firestore subscription lifecycle for Canvas
// =============================================================================
// Two-layer subscription:
//   1. Meta doc (page list) — subscribed while canvas is open
//   2. Page doc (nodes/edges/viewport) — subscribed to activePageId, re-subscribes on switch
// =============================================================================

import { useEffect } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

/**
 * Manages canvas context (user/channel) and Firestore subscriptions.
 * Subscribes to meta when canvas opens, subscribes to active page when activePageId changes.
 */
export function useCanvasSync(isOpen: boolean) {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const setContext = useCanvasStore((s) => s.setContext);
    const subscribeMeta = useCanvasStore((s) => s.subscribeMeta);
    const subscribe = useCanvasStore((s) => s.subscribe);
    const flush = useCanvasStore((s) => s._flush);
    const activePageId = useCanvasStore((s) => s.activePageId);

    // Set context whenever user/channel changes
    useEffect(() => {
        setContext(user?.uid ?? null, currentChannel?.id ?? null);
    }, [user?.uid, currentChannel?.id, setContext]);

    // Subscribe to meta doc when Canvas opens
    useEffect(() => {
        if (!isOpen || !user?.uid || !currentChannel?.id) return;
        const unsub = subscribeMeta();
        return () => { unsub(); };
    }, [isOpen, user?.uid, currentChannel?.id, subscribeMeta]);

    // Subscribe to active page doc — re-subscribes when activePageId changes
    useEffect(() => {
        if (!isOpen || !user?.uid || !currentChannel?.id || !activePageId) return;
        const unsub = subscribe(activePageId);
        return () => {
            flush(); // persist any pending debounced save immediately
            unsub();
        };
    }, [isOpen, user?.uid, currentChannel?.id, activePageId, subscribe, flush]);
}
