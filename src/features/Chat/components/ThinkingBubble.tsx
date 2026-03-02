// =============================================================================
// ThinkingBubble — collapsible block showing Gemini's thinking process
// During streaming: shimmer + abbreviated summary of current thought
// After streaming: collapsed "Thought for Ns", expandable to full chain
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, ChevronDown } from 'lucide-react';

/** Abbreviate thinking text to a short summary for collapsed display */
function abbreviateThought(text: string, maxLen = 60): string {
    // Take the last sentence/fragment as it's the most recent thought
    const lines = text.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1] || '';
    const cleaned = last.replace(/^[-*•]\s*/, '').trim();
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen - 1) + '…';
}

interface ThinkingBubbleProps {
    /** Accumulated thinking text (grows during streaming) */
    text: string;
    /** Whether the response is still streaming */
    isStreaming: boolean;
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({ text, isStreaming }) => {
    const [expanded, setExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const startTimeRef = useRef<number>(0);
    const [elapsedMs, setElapsedMs] = useState(0);

    // Initialize start time on mount (outside render to satisfy React Compiler purity)
    useEffect(() => {
        startTimeRef.current = Date.now();
    }, []);

    // Track elapsed time while streaming
    useEffect(() => {
        if (!isStreaming) {
            setElapsedMs(Date.now() - startTimeRef.current);
            return;
        }
        const interval = setInterval(() => {
            setElapsedMs(Date.now() - startTimeRef.current);
        }, 100);
        return () => clearInterval(interval);
    }, [isStreaming]);

    // No auto-collapse: if user expanded thinking, they want to keep reading it

    const toggleExpand = useCallback(() => setExpanded(v => !v), []);

    if (!text) return null;

    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    const summary = isStreaming
        ? abbreviateThought(text)
        : `Thought for ${elapsedSec}s`;

    return (
        <div className="mb-2">
            {/* Header row — always visible */}
            <button
                type="button"
                className="flex items-center gap-1.5 w-full text-left px-0 py-0.5 bg-transparent border-none cursor-pointer group"
                onClick={toggleExpand}
            >
                <Brain
                    size={13}
                    className={`shrink-0 text-text-tertiary ${isStreaming ? 'animate-stream-pulse' : 'opacity-50'}`}
                />
                <span className={`flex-1 text-[11px] leading-tight truncate ${isStreaming ? 'text-text-tertiary italic' : 'text-text-tertiary/60'}`}>
                    {summary}
                </span>
                <ChevronDown
                    size={10}
                    className={`shrink-0 text-text-tertiary/40 transition-transform duration-200 group-hover:text-text-tertiary/70 ${expanded ? 'rotate-180' : ''}`}
                />
                {/* Shimmer bar during streaming */}
                {isStreaming && (
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-text-tertiary/20 to-transparent animate-shimmer" />
                )}
            </button>

            {/* Expandable content */}
            {expanded && (
                <div
                    ref={contentRef}
                    className="mt-1 pl-[22px] border-l-2 border-text-tertiary/15 max-h-[200px] overflow-y-auto animate-slide-down"
                >
                    <pre className="text-[11px] leading-relaxed text-text-tertiary/70 font-[inherit] whitespace-pre-wrap break-words m-0">
                        {text}
                    </pre>
                </div>
            )}
        </div>
    );
};
