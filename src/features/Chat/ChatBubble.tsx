// =============================================================================
// AI CHAT: Floating Bubble Button
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useChatStore } from '../../core/stores/chatStore';
import { useMusicStore } from '../../core/stores/musicStore';
import { useAuth } from '../../core/hooks/useAuth';
import { ChatPanel } from './ChatPanel';
import './Chat.css';

export const ChatBubble: React.FC = () => {
    const { isOpen, toggleOpen } = useChatStore();
    const { user, isLoading } = useAuth();
    const { pathname } = useLocation();
    const hasAudioPlayer = !!useMusicStore((s) => s.playingTrackId);

    // Delayed fade-in so bubble appears after page content settles
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setReady(true), 600);
        return () => clearTimeout(t);
    }, []);

    // Don't show bubble until auth resolves and user is logged in
    if (isLoading || !user) return null;

    // Pages with zoom controls in bottom-right: Home ("/") and Playlist detail ("/playlists/:id")
    const hasZoomControls = pathname === '/' || /^\/playlists\/[^/]+$/.test(pathname);

    // Trends page has timeline controls (zoom pill + vertical spread pill) in bottom-right
    const hasTimelineControls = pathname === '/trends';

    // Bottom offset: static Tailwind classes (dynamic template literals break JIT purge)
    const bottomClass = hasTimelineControls
        ? hasAudioPlayer ? 'bottom-[134px]' : 'bottom-[62px]'
        : hasZoomControls
            ? hasAudioPlayer ? 'bottom-[144px]' : 'bottom-[88px]'
            : hasAudioPlayer ? 'bottom-[88px]' : 'bottom-8';
    // Numeric value for max-height constraint in resize hook
    const bottomPx = hasTimelineControls
        ? hasAudioPlayer ? 134 : 62
        : hasZoomControls
            ? hasAudioPlayer ? 144 : 88
            : hasAudioPlayer ? 88 : 32;

    // Horizontal offset: on Trends, shift left to sit in the corner pocket
    // VerticalSpread left edge at 58px + 12px gap (same as gap-3 bottom gap) → right-[70px]
    const rightClass = hasTimelineControls ? 'right-[70px]' : 'right-8';
    const rightPx = hasTimelineControls ? 70 : 32;

    return (
        <>
            {isOpen && <ChatPanel onClose={toggleOpen} anchorBottomPx={bottomPx} anchorRightPx={rightPx} />}

            {!isOpen && (
                <button
                    className={`chat-bubble fixed z-sticky w-12 h-12 rounded-full border border-border cursor-pointer flex items-center justify-center bg-bg-secondary/90 backdrop-blur-md shadow-lg text-text-secondary transition-[bottom,transform,filter,opacity] duration-500 hover:brightness-125 hover:scale-110 active:scale-95 ${rightClass} ${bottomClass}`}
                    style={{ opacity: ready ? 1 : 0, pointerEvents: ready ? undefined : 'none' }}
                    onClick={toggleOpen}
                    title="AI Chat"
                >
                    <MessageCircle className="w-[22px] h-[22px]" />
                </button>
            )}
        </>
    );
};

