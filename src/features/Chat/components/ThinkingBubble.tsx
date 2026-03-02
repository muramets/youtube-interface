// =============================================================================
// ThinkingBubble — collapsible block showing Gemini's thinking process
// During streaming: shimmer + abbreviated summary of current thought
// After streaming: collapsed "Thought for Ns", expandable to full chain
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
    /** Pre-computed elapsed time (from session cache, used for persisted messages) */
    initialElapsedMs?: number;
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({ text, isStreaming, initialElapsedMs }) => {
    const [expanded, setExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const startTimeRef = useRef<number>(0);
    const [elapsedMs, setElapsedMs] = useState(initialElapsedMs ?? 0);

    // Initialize start time on mount (outside render to satisfy React Compiler purity)
    useEffect(() => {
        startTimeRef.current = Date.now();
    }, []);

    // Track elapsed time while streaming
    useEffect(() => {
        if (!isStreaming) {
            // Don't overwrite pre-computed elapsed from session cache
            if (initialElapsedMs == null) {
                setElapsedMs(Date.now() - startTimeRef.current);
            }
            return;
        }
        const interval = setInterval(() => {
            setElapsedMs(Date.now() - startTimeRef.current);
        }, 100);
        return () => clearInterval(interval);
    }, [isStreaming, initialElapsedMs]);

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
                <span className={`flex-1 text-[11px] leading-tight truncate ${isStreaming ? 'text-shimmer italic' : 'text-text-tertiary/60'}`}>
                    {summary}
                </span>
                <ChevronDown
                    size={10}
                    className={`shrink-0 text-text-tertiary opacity-40 transition-transform duration-200 group-hover:opacity-70 ${expanded ? 'rotate-180' : ''}`}
                />
                {/* Shimmer bar during streaming */}
                {isStreaming && (
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-text-tertiary/20 to-transparent animate-shimmer" />
                )}
            </button>

            {/* Expandable content — lightweight markdown */}
            {expanded && (
                <div
                    ref={contentRef}
                    className="thinking-bubble-content mt-1 pl-[22px] border-l-2 border-text-tertiary/15 max-h-[200px] overflow-y-auto animate-slide-down"
                >
                    <ReactMarkdown
                        components={{
                            p: ({ children }) => <p className="text-[11px] leading-relaxed text-text-tertiary/70 m-0 mb-1 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="text-text-tertiary/90 font-semibold">{children}</strong>,
                            em: ({ children }) => <em>{children}</em>,
                            ul: ({ children }) => <ul className="text-[11px] text-text-tertiary/70 pl-4 my-0.5 list-disc">{children}</ul>,
                            ol: ({ children }) => <ol className="text-[11px] text-text-tertiary/70 pl-4 my-0.5 list-decimal">{children}</ol>,
                            li: ({ children }) => <li className="my-0.5">{children}</li>,
                            code: ({ children }) => <code className="text-[10px] bg-white/[0.04] px-1 py-0.5 rounded">{children}</code>,
                            pre: ({ children }) => <pre className="text-[11px] text-text-tertiary/70 whitespace-pre-wrap break-words m-0 my-1">{children}</pre>,
                            h1: ({ children }) => <p className="text-[11px] font-semibold text-text-tertiary/80 m-0 mb-1">{children}</p>,
                            h2: ({ children }) => <p className="text-[11px] font-semibold text-text-tertiary/80 m-0 mb-1">{children}</p>,
                            h3: ({ children }) => <p className="text-[11px] font-semibold text-text-tertiary/80 m-0 mb-1">{children}</p>,
                        }}
                    >
                        {text}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
};

