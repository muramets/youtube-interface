// =============================================================================
// useCanvasSync — Firestore subscription lifecycle for Canvas
// =============================================================================

import { useEffect } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

/**
 * Manages canvas context (user/channel) and Firestore subscription.
 * Subscribes when canvas opens, unsubscribes on close or unmount.
 */
export function useCanvasSync(isOpen: boolean) {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const setContext = useCanvasStore((s) => s.setContext);
    const subscribe = useCanvasStore((s) => s.subscribe);
    const flush = useCanvasStore((s) => s._flush);

    // Set context whenever user/channel changes
    useEffect(() => {
        setContext(user?.uid ?? null, currentChannel?.id ?? null);
    }, [user?.uid, currentChannel?.id, setContext]);

    // Subscribe to Firestore when Canvas opens; flush pending save on close
    useEffect(() => {
        if (!isOpen || !user?.uid || !currentChannel?.id) return;
        const unsub = subscribe();
        return () => {
            flush(); // persist any pending debounced save immediately
            unsub();
        };
    }, [isOpen, user?.uid, currentChannel?.id, subscribe, flush]);
}
