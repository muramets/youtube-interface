// =============================================================================
// AI CHAT: Floating Bubble Button
// =============================================================================

import React from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useChatStore } from '../../core/stores/chatStore';
import { useMusicStore } from '../../core/stores/musicStore';
import { ChatPanel } from './ChatPanel';
import './Chat.css';

export const ChatBubble: React.FC = () => {
    const { isOpen, toggleOpen } = useChatStore();
    const { pathname } = useLocation();
    const hasAudioPlayer = !!useMusicStore((s) => s.playingTrackId);

    // Pages with zoom controls in bottom-right: Home ("/") and Playlist detail ("/playlists/:id")
    const hasZoomControls = pathname === '/' || /^\/playlists\/[^/]+$/.test(pathname);

    // Calculate bottom offset: base + zoom controls offset + audio player offset
    const bottomClass = hasZoomControls
        ? hasAudioPlayer ? 'bottom-[152px] right-8' : 'bottom-24 right-8'
        : hasAudioPlayer ? 'bottom-[80px] right-6' : 'bottom-6 right-6';

    return (
        <>
            {isOpen && <ChatPanel onClose={toggleOpen} hasAudioPlayer={hasAudioPlayer} />}

            {!isOpen && (
                <button
                    className={`chat-bubble fixed z-max w-12 h-12 rounded-full border border-border cursor-pointer flex items-center justify-center bg-bg-secondary shadow-lg text-text-secondary transition-transform duration-150 ${bottomClass}`}
                    onClick={toggleOpen}
                    title="AI Chat"
                >
                    <MessageCircle className="w-[22px] h-[22px]" />
                </button>
            )}
        </>
    );
};
