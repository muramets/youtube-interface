// =============================================================================
// AI CHAT: Message List Component
// =============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
// Selective language imports (~100KB vs ~600KB full Prism)
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';

SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('jsx', tsx);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('svg', markup);
import type { ChatMessage } from '../../core/types/chat';
import type { VideoCardContext, SuggestedTrafficContext } from '../../core/types/appContext';
import type { ModelPricing } from '../../../shared/models';
import { estimateCostEur } from '../../../shared/models';
import { FileAudio, FileVideo, File, Copy, Check, ArrowDown, RotateCcw, Zap, MessageCircle, Pencil } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useChatStore } from '../../core/stores/chatStore';
import { formatRelativeTime, STATIC_AGE } from './formatRelativeTime';
import { MessageErrorBoundary } from './components/ChatBoundaries';
import { VideoCardChip } from './VideoCardChip';
import { SuggestedTrafficChip } from './SuggestedTrafficChip';
import { debug } from '../../core/utils/debug';


// --- Code Block with Copy + Language Label ---

const CodeBlock: React.FC<{ language?: string; children: string }> = React.memo(({ language, children }) => {
    const [copied, setCopied] = useState(false);
    const code = children.replace(/\n$/, '');

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="chat-code-block my-2.5 rounded-lg overflow-hidden border border-white/[0.06]">
            <div className="chat-code-header flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/[0.06]">
                <span className="text-[11px] font-medium text-text-tertiary lowercase tracking-wide font-mono">{language || 'code'}</span>
                <button className={`bg-transparent border-none text-text-tertiary cursor-pointer p-0.5 flex opacity-0 transition-opacity duration-150 group-hover/code:opacity-100 hover:text-text-primary ${copied ? '!text-[#22c55e] !opacity-100' : ''}`} onClick={handleCopy} title="Copy code">
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
            </div>
            <SyntaxHighlighter
                language={language || 'text'}
                style={oneDark}
                customStyle={{
                    margin: 0,
                    borderRadius: '0 0 8px 8px',
                    fontSize: '12.5px',
                    lineHeight: '1.5',
                }}
                showLineNumbers={code.split('\n').length > 3}
                lineNumberStyle={{ minWidth: '2.5em', opacity: 0.35, fontSize: '11px' }}
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
});
CodeBlock.displayName = 'CodeBlock';


// --- Markdown Rendering ---

interface ChatMessageListProps {
    messages: ChatMessage[];
    modelPricing?: ModelPricing;
}

const MarkdownMessage: React.FC<{ text: string }> = React.memo(({ text }) => (
    <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
            code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const codeString = String(children);
                if (match) {
                    return <CodeBlock language={match[1]}>{codeString}</CodeBlock>;
                }
                return <code {...props}>{children}</code>;
            },
            a({ href, children, ...props }) {
                return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>;
            },
        }}
    >
        {text}
    </ReactMarkdown>
));
MarkdownMessage.displayName = 'MarkdownMessage';

// --- Copy Button ---

const CopyButton: React.FC<{ text: string }> = React.memo(({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback for non-secure contexts
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [text]);

    return (
        <button
            className={`group bg-transparent border-none text-text-tertiary cursor-pointer p-0.5 flex opacity-0 transition-opacity duration-150 hover:text-text-primary ${copied ? '!text-[#22c55e] !opacity-100' : ''}`}
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy message'}
        >
            {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
    );
});
CopyButton.displayName = 'CopyButton';

// --- Adaptive timer intervals ---
const TICK_RECENT = 60_000;       // < 1 hour: update every minute
const TICK_HOURS = 600_000;       // 1h – 2 days: update every 10 min

function getTickInterval(createdAt: Timestamp): number | null {
    const age = Date.now() - createdAt.toMillis();
    if (age >= STATIC_AGE) return null;
    return age < 3_600_000 ? TICK_RECENT : TICK_HOURS;
}

// --- Shared bubble class constants (DRY) ---
const MSG_BUBBLE_BASE = 'chat-message-bubble py-2 px-3.5 rounded-xl text-[13px] leading-normal break-words';
const MSG_BUBBLE_USER = `${MSG_BUBBLE_BASE} bg-[#2a2a2a] text-text-primary rounded-br-sm`;
const MSG_BUBBLE_MODEL = `${MSG_BUBBLE_BASE} bg-bg-secondary text-text-primary rounded-bl-sm`;

// --- Scroll State Machine types ---
type ScrollIntent = 'idle' | 'pinned' | 'away';

// --- Debounced markdown for streaming ---
function useDebouncedMarkdown(text: string | null, delay: number): string | null {
    const [debounced, setDebounced] = useState(text);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(text), delay);
        return () => clearTimeout(id);
    }, [text, delay]);
    return debounced;
}


// --- Message Item (per-message timer + visibility tracking) ---

interface MessageItemProps {
    msg: ChatMessage;
    modelPricing?: ModelPricing;
    skipAnimation?: boolean;
    isFailed?: boolean;
    isStreaming?: boolean;
    onRetry?: () => void;
    onEdit?: (msg: ChatMessage) => void;
}

const MessageItem: React.FC<MessageItemProps> = React.memo(({ msg, modelPricing, skipAnimation, isFailed, isStreaming, onRetry, onEdit }) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const isVisibleRef = useRef(false);
    const [timestamp, setTimestamp] = useState(() => formatRelativeTime(msg.createdAt));

    // Track visibility via IntersectionObserver
    useEffect(() => {
        const el = itemRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { isVisibleRef.current = entry.isIntersecting; },
            { threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Adaptive timer: only ticks when visible, frequency decreases with age
    useEffect(() => {
        const interval = getTickInterval(msg.createdAt);
        if (interval === null) return; // Static date, no timer needed

        const id = setInterval(() => {
            if (!isVisibleRef.current) return; // Skip offscreen messages
            setTimestamp(formatRelativeTime(msg.createdAt));
        }, interval);
        return () => clearInterval(id);
    }, [msg.createdAt]);

    return (
        <div ref={itemRef} className={`chat-message flex flex-col max-w-[85%] ${skipAnimation ? '' : 'animate-message-in'} ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
            {/* Video card context */}
            {msg.appContext && msg.appContext.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                    {msg.appContext
                        .filter((c): c is VideoCardContext => c.type === 'video-card')
                        .map(v => (
                            <VideoCardChip key={v.videoId} video={v} compact />
                        ))}
                    {msg.appContext
                        .filter((c): c is SuggestedTrafficContext => c.type === 'suggested-traffic')
                        .map(tc => (
                            <SuggestedTrafficChip key={tc.sourceVideo.videoId} context={tc} compact />
                        ))}
                </div>
            )}

            {/* File Attachments */}
            {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {msg.attachments.map((att) => {
                        if (att.type === 'image') {
                            return (
                                <img
                                    key={att.url || att.name}
                                    src={att.url}
                                    alt={att.name}
                                    className="max-w-[180px] max-h-[140px] rounded-lg object-cover border border-border"
                                />
                            );
                        }
                        const icon = att.type === 'audio'
                            ? <FileAudio size={14} />
                            : att.type === 'video'
                                ? <FileVideo size={14} />
                                : <File size={14} />;
                        return (
                            <div key={att.url || att.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card-bg text-xs text-text-secondary border border-border">
                                {icon}
                                <span>{att.name}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className={`${msg.role === 'user' ? MSG_BUBBLE_USER : MSG_BUBBLE_MODEL} ${isFailed ? 'border border-red-500/40' : ''}`}>
                {msg.role === 'model' ? <MarkdownMessage text={msg.text} /> : msg.text}
            </div>

            {/* Failed message indicator */}
            {isFailed && (
                <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-red-400">Failed to send</span>
                    <button
                        className="bg-transparent border-none text-red-400 cursor-pointer p-0.5 flex items-center gap-1 hover:text-red-300 transition-colors text-[11px]"
                        onClick={onRetry}
                        title="Retry"
                    >
                        <RotateCcw size={12} /> Retry
                    </button>
                </div>
            )}

            {/* Message footer: timestamp + tokens + copy */}
            <div className="group/msg flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-text-tertiary select-none cursor-default hover:text-text-secondary transition-colors">
                    {timestamp}
                </span>
                {msg.role === 'model' && msg.tokenUsage && (
                    <span className="text-[10px] text-text-tertiary select-none cursor-default inline-flex items-center gap-0.5 hover:text-text-secondary transition-colors">
                        <Zap size={10} /> {msg.tokenUsage.totalTokens.toLocaleString()}
                        {modelPricing && (
                            <> • €{estimateCostEur(modelPricing, msg.tokenUsage.promptTokens, msg.tokenUsage.completionTokens).toFixed(4)}</>)}
                    </span>
                )}
                {msg.role === 'model' && (
                    <CopyButton text={msg.text} />
                )}
                {msg.role === 'user' && !isFailed && !isStreaming && (
                    <button
                        className="bg-transparent border-none text-text-tertiary cursor-pointer p-0.5 flex opacity-0 transition-opacity duration-150 hover:text-text-primary group-hover/msg:opacity-100"
                        onClick={() => onEdit?.(msg)}
                        title="Edit message"
                    >
                        <Pencil size={11} />
                    </button>
                )}
            </div>
        </div>
    );
});
MessageItem.displayName = 'MessageItem';

// --- Main Component ---

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
    messages,
    modelPricing,
}) => {
    const streamingText = useChatStore(s => s.streamingText);
    const isStreaming = useChatStore(s => s.isStreaming);
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const pinAnchorRef = useRef<HTMLDivElement>(null);
    const spacerRef = useRef<HTMLDivElement>(null);
    const [showScrollFab, setShowScrollFab] = useState(false);
    const isProgrammaticRef = useRef(false);
    const scrollEndCleanupRef = useRef<(() => void) | null>(null);

    // --- Scroll State Machine ---
    const intentRef = useRef<ScrollIntent>('idle');
    const prevMsgCountRef = useRef(messages.length);
    const prevStreamingRef = useRef(isStreaming);
    const wasStreamingRef = useRef(false); // tracks previous render's isStreaming, for skip-animation logic
    const failedMessageId = useChatStore(s => s.lastFailedRequest?.messageId);
    const retryLastMessage = useChatStore(s => s.retryLastMessage);
    const setEditingMessage = useChatStore(s => s.setEditingMessage);
    const debouncedStreamingText = useDebouncedMarkdown(streamingText, 150);

    // Helper: set scrollTop without triggering handleScroll's away-detection
    // Uses scrollend event to keep guard up for entire smooth scroll duration
    const programmaticScroll = useCallback((fn: () => void) => {
        debug.scroll('programmaticScroll: setting isProgrammatic=true');
        // Clean up any previous listener
        scrollEndCleanupRef.current?.();
        isProgrammaticRef.current = true;
        fn();
        const container = containerRef.current;
        if (container) {
            const reset = () => {
                isProgrammaticRef.current = false;
                const el = containerRef.current;
                const finalPos = el ? `scrollTop=${el.scrollTop} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}` : 'no container';
                debug.scroll(`programmaticScroll: reset isProgrammatic=false (scrollend/timeout) ${finalPos}`);
                clearTimeout(fallback);
                container.removeEventListener('scrollend', reset);
                scrollEndCleanupRef.current = null;
            };
            container.addEventListener('scrollend', reset, { once: true });
            const fallback = setTimeout(reset, 1000);
            scrollEndCleanupRef.current = reset;
        }
    }, []);

    // Helper: expand/collapse spacer synchronously via DOM
    const setSpacer = useCallback((height: number) => {
        debug.scroll(`setSpacer: ${height}px`);
        if (spacerRef.current) {
            spacerRef.current.style.minHeight = height > 0 ? `${height}px` : '0px';
        }
    }, []);

    // Single effect: all scroll decisions in one place, clear priority
    useEffect(() => {
        const container = containerRef.current;
        const bottom = bottomRef.current;
        if (!container || !bottom) return;

        const newCount = messages.length;
        const prevCount = prevMsgCountRef.current;
        const streamingJustStarted = isStreaming && !prevStreamingRef.current;
        const streamingJustEnded = !isStreaming && prevStreamingRef.current;

        debug.scroll(`=== EFFECT === intent=${intentRef.current} msgs=${prevCount}→${newCount} streaming=${isStreaming} justStarted=${streamingJustStarted} justEnded=${streamingJustEnded} streamingText=${streamingText ? streamingText.length + 'chars' : 'null'}`);
        debug.scroll(`  container: scrollTop=${container.scrollTop} scrollHeight=${container.scrollHeight} clientHeight=${container.clientHeight}`);

        // Update trackers
        prevMsgCountRef.current = newCount;
        prevStreamingRef.current = isStreaming;

        // --- Priority 1: Pin-to-top when user sends a new message ---
        if (newCount > prevCount && intentRef.current !== 'away') {
            const lastMsg = messages[newCount - 1];
            debug.scroll(`P1 check: newMsg role=${lastMsg?.role}`);
            if (lastMsg?.role === 'user') {
                // 1. Expand spacer SYNCHRONOUSLY so scrollTop won't be clamped
                const spacerHeight = container.clientHeight;
                setSpacer(spacerHeight);
                debug.scroll(`P1: spacer expanded to ${spacerHeight}px, scrollHeight now=${container.scrollHeight}`);

                // 2. Smooth scroll to pin user message at top
                const anchor = pinAnchorRef.current;
                if (anchor) {
                    const lastMsgEl = anchor.previousElementSibling as HTMLElement | null;
                    if (lastMsgEl) {
                        const cRect = container.getBoundingClientRect();
                        const mRect = lastMsgEl.getBoundingClientRect();
                        const targetScrollTop = container.scrollTop + (mRect.top - cRect.top - 12);
                        debug.scroll(`P1: pin scroll — current=${container.scrollTop} target=${targetScrollTop} delta=${mRect.top - cRect.top - 12} mRect.top=${mRect.top} cRect.top=${cRect.top}`);
                        programmaticScroll(() => {
                            container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                        });
                    } else {
                        debug.scroll('P1: no lastMsgEl found (anchor.previousElementSibling is null)');
                    }
                } else {
                    debug.scroll('P1: no pinAnchorRef');
                }

                intentRef.current = 'pinned';
                debug.scroll('P1: intent → pinned, returning');
                return;
            }
        }

        // --- Priority 2: During streaming — stay pinned, no auto-scroll ---
        // Text grows below user message. User scrolls manually if needed.
        if (isStreaming && intentRef.current !== 'away') {
            if (streamingJustStarted && intentRef.current === 'idle') {
                debug.scroll('P2: streaming just started, intent idle → pinned');
                intentRef.current = 'pinned';
            }
            debug.scroll(`P2: streaming active, intent=${intentRef.current}, no scroll`);
            return;
        }

        // --- Priority 3: Streaming just ended — collapse spacer, preserve position ---
        if (streamingJustEnded) {
            debug.scroll('P3: streaming ended, collapsing spacer, intent → idle');
            setSpacer(0);
            intentRef.current = 'idle';
            return;
        }

        // --- Priority 4: Non-streaming new messages (history loaded, AI response persisted) ---
        if (newCount > prevCount && intentRef.current === 'idle') {
            const isInitialLoad = prevCount === 0;
            debug.scroll(`P4: new messages, isInitialLoad=${isInitialLoad}`);
            if (isInitialLoad) {
                // Initial load: wait for DOM layout to complete, then instant-scroll to true bottom
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const finalScrollHeight = container.scrollHeight;
                        const target = finalScrollHeight - container.clientHeight;
                        debug.scroll(`P4 (instant): scrollHeight=${finalScrollHeight} target=${target}`);
                        container.scrollTop = target;
                        debug.scroll(`P4 (instant): scrollTop after set=${container.scrollTop}`);
                    });
                });
            } else {
                debug.scroll('P4 (smooth): scrollTo bottom');
                programmaticScroll(() => {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                });
            }
        }

        debug.scroll(`=== END === intent=${intentRef.current}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length, streamingText, isStreaming]);

    // Track scroll position for FAB + away detection (ignores programmatic scrolls)
    const handleScroll = useCallback(() => {
        if (isProgrammaticRef.current) {
            debug.scroll('handleScroll: skipped (programmatic)');
            return;
        }
        const el = containerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

        setShowScrollFab(distanceFromBottom > 200);

        if (distanceFromBottom > 80 && intentRef.current === 'pinned') {
            debug.scroll(`handleScroll: user scrolled away! distance=${distanceFromBottom} intent pinned → away`);
            intentRef.current = 'away';
        }

        if (distanceFromBottom <= 80 && intentRef.current === 'away') {
            debug.scroll(`handleScroll: user scrolled back near bottom, intent away → idle`);
            intentRef.current = 'idle';
        }
    }, []);

    // Auto-scroll when container height shrinks (e.g. context chips appear in ChatInput)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let prevHeight = el.clientHeight;
        const observer = new ResizeObserver(() => {
            const newHeight = el.clientHeight;
            if (newHeight < prevHeight) {
                // Container shrank — check if user was near bottom before the resize
                const distFromBottom = el.scrollHeight - el.scrollTop - prevHeight;
                if (distFromBottom < 80) {
                    el.scrollTop = el.scrollHeight - newHeight;
                }
            }
            prevHeight = newHeight;
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const scrollToBottom = useCallback(() => {
        debug.scroll('scrollToBottom clicked');
        intentRef.current = 'idle';
        setSpacer(0);
        programmaticScroll(() => {
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
        });
    }, [setSpacer, programmaticScroll]);

    if (messages.length === 0 && !isStreaming) {
        return (
            <div className="chat-messages flex-1 min-h-0 overflow-y-auto px-3.5 pt-3.5 pb-1 flex flex-col gap-3">
                <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-tertiary text-[13px] text-center p-6 select-none cursor-default">
                    <MessageCircle size={48} strokeWidth={1.5} className="opacity-35" />
                    <span>Start a conversation.<br />You can send text, images, audio, or video.</span>
                </div>
            </div>
        );
    }

    // Determine if the last message just came from streaming (to skip its entrance animation)
    // wasStreamingRef tracks the PREVIOUS render's isStreaming — set synchronously during render,
    // so it's available before the useEffect (which runs post-render).
    const lastMsgIndex = messages.length - 1;
    const skipAnimateLastMsg = (wasStreamingRef.current || isStreaming) && messages[lastMsgIndex]?.role === 'model';
    wasStreamingRef.current = isStreaming; // update AFTER reading, so next render sees this render's value

    return (
        <div className="chat-messages flex-1 min-h-0 overflow-y-auto px-3.5 pt-3.5 pb-1 flex flex-col gap-3" ref={containerRef} onScroll={handleScroll}>
            {messages.map((msg, idx) => (
                <MessageErrorBoundary key={msg.id} messageId={msg.id}>
                    <MessageItem
                        msg={msg}
                        modelPricing={modelPricing}
                        skipAnimation={idx === lastMsgIndex && skipAnimateLastMsg}
                        isFailed={msg.role === 'user' && failedMessageId === msg.id}
                        isStreaming={isStreaming}
                        onRetry={retryLastMessage}
                        onEdit={setEditingMessage}
                    />
                </MessageErrorBoundary>
            ))}

            {/* Pin anchor — invisible sentinel for pin-to-top scroll position */}
            <div ref={pinAnchorRef} className="h-0 -mt-3" />

            {/* Streaming message */}
            {isStreaming && (
                <div className="chat-message flex flex-col max-w-[85%] self-start animate-message-in mb-2">
                    <div className={MSG_BUBBLE_MODEL}>
                        {streamingText ? (
                            <div className="animate-fade-in">
                                {debouncedStreamingText ? <MarkdownMessage text={debouncedStreamingText} /> : <span className="whitespace-pre-wrap">{streamingText}</span>}
                            </div>
                        ) : (
                            <span className="inline-flex items-center gap-[3px] align-middle">
                                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-typing-dot" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-typing-dot" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-typing-dot" style={{ animationDelay: '300ms' }} />
                            </span>
                        )}
                    </div>
                </div>
            )}

            <div ref={bottomRef} className="-mt-3" />

            {/* Scroll-past-end spacer — after bottomRef, only adds scrollHeight */}
            <div ref={spacerRef} aria-hidden="true" style={{ minHeight: 0 }} />

            {/* Scroll-to-bottom FAB */}
            {
                showScrollFab && (
                    <button className="sticky bottom-2 self-center bg-card-bg border border-border rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-text-secondary shadow-md transition-colors duration-100 z-5 hover:bg-hover hover:text-text-primary" onClick={scrollToBottom} title="Scroll to bottom">
                        <ArrowDown size={16} />
                    </button>
                )
            }
        </div >
    );
};
