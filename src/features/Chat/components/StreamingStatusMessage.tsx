// =============================================================================
// StreamingStatusMessage — progressive status during streaming idle phase.
//
// Renders only when the AI is streaming but no text or thinking has arrived yet.
// Shows time-based progressive messages (0–10s: nothing, 10–30s: processing,
// 30–60s: complex request, 60s+: still thinking) or a reconnect label when
// retryAttempt > 0.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Loader } from 'lucide-react';
import { useChatStore } from '../../../core/stores/chatStore';

function getProgressiveMessage(elapsedSecs: number): string | null {
    if (elapsedSecs < 10) return null;
    if (elapsedSecs < 30) return 'Processing your request...';
    if (elapsedSecs < 60) return 'Complex request — model is taking longer than usual...';
    return 'Still thinking, this may take a moment longer...';
}

export const StreamingStatusMessage: React.FC = () => {
    const isStreaming = useChatStore(s => s.isStreaming);
    const streamingText = useChatStore(s => s.streamingText);
    const thinkingText = useChatStore(s => s.thinkingText);
    const retryAttempt = useChatStore(s => s.retryAttempt);

    const [elapsedSecs, setElapsedSecs] = useState(0);
    // Timestamp written inside the effect when the interval starts — never read during render.
    const startTimeRef = useRef(0);

    // Subscribe to a 1-second tick whenever the component is in its "waiting" state.
    // retryAttempt in deps causes the effect to restart (and startTimeRef to reset) on
    // each new connection attempt so elapsed is always relative to the current attempt.
    useEffect(() => {
        if (!isStreaming || streamingText || thinkingText) return;

        startTimeRef.current = Date.now();

        const interval = setInterval(() => {
            setElapsedSecs(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [isStreaming, streamingText, thinkingText, retryAttempt]);

    // Hide when not streaming or when content is already flowing
    if (!isStreaming || streamingText || thinkingText) return null;

    const message =
        retryAttempt > 0
            ? `Reconnecting (attempt ${retryAttempt})...`
            : getProgressiveMessage(elapsedSecs);

    if (!message) return null;

    return (
        <div className="flex items-center gap-1.5 mb-2 animate-fade-in">
            <Loader
                size={13}
                className="shrink-0 text-text-tertiary animate-spin"
            />
            <span className="flex-1 text-[11px] leading-tight truncate text-shimmer italic">
                {message}
            </span>
        </div>
    );
};
