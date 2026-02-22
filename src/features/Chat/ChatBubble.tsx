// =============================================================================
// AI CHAT: Floating Bubble Button
// =============================================================================

import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { useChatStore } from '../../core/stores/chatStore';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { useFloatingBottomOffset } from '../../core/hooks/useFloatingBottomOffset';
import { useAuth } from '../../core/hooks/useAuth';
import { useMusicStore } from '../../core/stores/musicStore';
import { ChatPanel } from './ChatPanel';
import './Chat.css';

export const ChatBubble: React.FC = () => {
    const { isOpen, toggleOpen } = useChatStore();
    const { user, isLoading } = useAuth();
    const { bottomClass, bottomPx, rightClass, rightPx } = useFloatingBottomOffset();

    // Delayed fade-in so bubble appears after page content settles
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setReady(true), 600);
        return () => clearTimeout(t);
    }, []);

    const { isOpen: isCanvasOpen } = useCanvasStore();
    const hasAudioPlayer = !!useMusicStore((s) => s.playingTrackId);

    // When canvas is open, position Chat FAB just above the zoom pill:
    // pill bottom (16 or 88) + pill height (34) + gap (8) = 58 or 130
    const canvasOverrideBottom = (hasAudioPlayer ? 88 : 16) + 34 + 8;
    // Align with the × close button (right-6 = 24px)
    const CANVAS_CLOSE_RIGHT = 24;

    // Don't show bubble until auth resolves and user is logged in
    if (isLoading || !user) return null;

    return (
        <>
            {isOpen && <ChatPanel onClose={toggleOpen} anchorBottomPx={bottomPx} anchorRightPx={rightPx} />}

            {!isOpen && (
                <button
                    className={`chat-bubble fixed w-12 h-12 rounded-full border border-border cursor-pointer flex items-center justify-center bg-bg-secondary/90 backdrop-blur-md shadow-lg text-text-secondary transition-[bottom,right,transform,filter,opacity] duration-300 hover:brightness-125 hover:scale-110 active:scale-95 ${isCanvasOpen ? '' : `${rightClass} ${bottomClass}`}`}
                    style={{
                        opacity: ready ? 1 : 0,
                        pointerEvents: ready ? undefined : 'none',
                        zIndex: isCanvasOpen ? 401 : undefined,
                        ...(isCanvasOpen && {
                            bottom: canvasOverrideBottom,
                            right: CANVAS_CLOSE_RIGHT,
                        }),
                    }}
                    onClick={toggleOpen}
                    title="AI Chat"
                >
                    <MessageCircle className="w-[22px] h-[22px]" />
                </button>
            )}
        </>
    );
};

