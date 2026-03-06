// =============================================================================
// AI CHAT: Message List Component
// =============================================================================

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useChatScroll } from './hooks/useChatScroll';
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
import type { ChatMessage } from '../../core/types/chat/chat';
import { shouldShowMessage } from '../../core/types/chat/chat';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../../core/types/appContext';
import type { VideoCardContext } from '../../core/types/appContext';
import { buildVideoIdMap } from '../../core/utils/buildReferenceMap';
import { estimateCostUsd, estimateCacheSavingsUsd, type ModelPricing } from '../../core/types/chat/chat';
import { getEffectiveDisplayLevel } from './utils/tokenDisplay';
import { EXPENSIVE_MESSAGE_THRESHOLD } from './hooks/useCostAlerts';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { MemoryCheckpoint } from './components/MemoryCheckpoint';
import { FileAudio, FileVideo, File, Copy, Check, ArrowDown, RotateCcw, MessageCircle, Pencil, Square } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useChatStore } from '../../core/stores/chat/chatStore';
import { VideoReferenceTooltip } from './components/VideoReferenceTooltip';
import { formatRelativeTime, STATIC_AGE } from './formatRelativeTime';
import { normalizeMarkdown } from './utils/normalizeMarkdown';
import { buildToolVideoMap } from './utils/buildToolVideoMap';
import { MessageErrorBoundary } from './components/ChatBoundaries';
import { VideoCardChip } from './VideoCardChip';
import { SuggestedTrafficChip } from './SuggestedTrafficChip';
import { CanvasSelectionChip } from './CanvasSelectionChip';
import { SelectionToolbar } from './components/SelectionToolbar';
import { ThinkingBubble } from './components/ThinkingBubble';
import { ToolCallSummary } from './components/ToolCallSummary';
import { ConfirmLargePayloadBanner } from './components/ConfirmLargePayloadBanner';
import { StreamingStatusMessage } from './components/StreamingStatusMessage';
import { getSessionThinking } from '../../core/stores/chat/chatStore';

/** Regex to detect mention:// URIs in markdown links */
const MENTION_RE = /^mention:\/\/(.+)$/;

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

const MarkdownMessage: React.FC<{ text: string; videoMap?: Map<string, VideoCardContext> }> = React.memo(({ text, videoMap }) => {

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            // Allow mention:// URIs through the URL sanitizer
            urlTransform={(url) => {
                if (MENTION_RE.test(url)) return url;
                return url;
            }}
            components={{
                code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeString = String(children);
                    if (match) {
                        return <CodeBlock language={match[1]}>{codeString}</CodeBlock>;
                    }
                    return <code {...props}>{children}</code>;
                },
                a({ href, children }) {
                    const childText = String(children);

                    // Structured mention: mention://videoId
                    if (href && videoMap) {
                        const mentionMatch = MENTION_RE.exec(href);
                        if (mentionMatch) {
                            const videoId = mentionMatch[1];
                            const video = videoMap.get(videoId) ?? null;
                            // Gemini sometimes writes [videoId](mention://videoId) instead of [Title](mention://videoId).
                            // Prefer the real title from videoMap when the link text looks like a raw ID.
                            const label = (video?.title && childText === videoId) ? video.title : childText;
                            return <VideoReferenceTooltip label={label} video={video} refType="video" index={0} />;
                        }
                    }

                    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                },
            }}
        >
            {normalizeMarkdown(text)}
        </ReactMarkdown>
    );
});
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
    videoMap?: Map<string, VideoCardContext>;
    /** Session-only thinking data (not persisted, shown only for last model msg) */
    sessionThinking?: { text: string; elapsedMs: number } | null;
}

const MessageItem: React.FC<MessageItemProps> = React.memo(({ msg, modelPricing, skipAnimation, isFailed, isStreaming, onRetry, onEdit, videoMap, sessionThinking }) => {
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

    // Pre-compute cache-aware cost for model messages (avoids IIFE in JSX)
    // Reads normalizedUsage (accurate, provider-agnostic) with fallback to legacy tokenUsage
    const messageCost = useMemo(() => {
        if (msg.role !== 'model') return null;
        const nu = msg.normalizedUsage;
        // Current: hardcoded debug level (solo user). Future: from user settings + subscription tier.
        const level = getEffectiveDisplayLevel('debug', 'debug');

        if (nu) {
            // --- Normalized path (new) ---
            const costTotal = nu.billing.cost.total;
            const cachedTokens = nu.billing.input.cached;
            const totalInput = nu.billing.input.total;
            const cachedPct = totalInput > 0 && cachedTokens > 0
                ? Math.round((cachedTokens / totalInput) * 100) : 0;

            const lines: string[] = [];

            // minimal: cost only
            lines.push(`Cost: $${costTotal.toFixed(4)}${nu.billing.cost.withoutCache > costTotal ? ` (without cache: $${nu.billing.cost.withoutCache.toFixed(4)})` : ''}`);

            // standard+: input/output/cache
            if (level !== 'minimal') {
                lines.unshift(
                    `Input: ${nu.contextWindow.inputTokens.toLocaleString()} tokens${cachedTokens ? ` (${cachedTokens.toLocaleString()} cached)` : ''}`,
                    `Output: ${nu.contextWindow.outputTokens.toLocaleString()} tokens${nu.contextWindow.thinkingTokens > 0 && (level === 'detailed' || level === 'debug') ? ` (${nu.contextWindow.thinkingTokens.toLocaleString()} thinking)` : ''}`,
                );
            }

            // detailed+: thinking, iterations, tool calls
            if ((level === 'detailed' || level === 'debug') && nu.billing.iterations > 1) {
                const toolCount = msg.toolCalls?.length ?? 0;
                lines.push(`Tool calls: ${toolCount} (${nu.billing.iterations} iterations)`);
            }

            return { cost: costTotal, cachedPct, tooltip: lines.join('\n') };
        }

        // --- Legacy fallback (pre-normalization messages) ---
        if (!msg.tokenUsage || !modelPricing) return null;
        const { promptTokens, completionTokens, cachedTokens, cacheWriteTokens } = msg.tokenUsage;
        const totalInput = promptTokens + (cachedTokens ?? 0) + (cacheWriteTokens ?? 0);
        const cost = estimateCostUsd(modelPricing, promptTokens, completionTokens, cachedTokens, cacheWriteTokens);
        const savings = estimateCacheSavingsUsd(modelPricing, promptTokens, completionTokens, cachedTokens, cacheWriteTokens);
        const cachedPct = cachedTokens ? Math.round((cachedTokens / totalInput) * 100) : 0;
        const tooltip = [
            `Input: ${totalInput.toLocaleString()} tokens${cachedTokens ? ` (${cachedTokens.toLocaleString()} cached)` : ''}`,
            `Output: ${completionTokens.toLocaleString()} tokens`,
            `Cost: $${cost.toFixed(4)}${savings > 0 ? ` (without cache: $${(cost + savings).toFixed(4)})` : ''}`,
        ].join('\n');
        return { cost, cachedPct, tooltip };
    }, [msg.role, msg.tokenUsage, msg.normalizedUsage, msg.toolCalls, modelPricing]);

    return (
        <div ref={itemRef} data-message-id={msg.id} data-message-role={msg.role} className={`chat-message flex flex-col max-w-[85%] ${skipAnimation ? '' : 'animate-message-in'} ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
            {/* Video card context */}
            {msg.appContext && msg.appContext.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                    {getVideoCards(msg.appContext).map(v => (
                        <VideoCardChip key={v.videoId} video={v} compact />
                    ))}
                    {getTrafficContexts(msg.appContext).map(tc => (
                        <SuggestedTrafficChip key={tc.sourceVideo.videoId} context={tc} compact />
                    ))}
                    {getCanvasContexts(msg.appContext).map((cc, i) => (
                        <CanvasSelectionChip key={`canvas-${i}`} context={cc} compact />
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
                {/* Session-only thinking bubble (not persisted to Firestore) */}
                {msg.role === 'model' && sessionThinking && (
                    <ThinkingBubble text={sessionThinking.text} isStreaming={false} initialElapsedMs={sessionThinking.elapsedMs} />
                )}
                {/* Tool call summary for persisted model messages */}
                {msg.role === 'model' && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <ToolCallSummary toolCalls={msg.toolCalls} videoMap={videoMap} />
                )}
                {msg.role === 'model' ? <MarkdownMessage text={msg.text} videoMap={videoMap} /> : msg.text}
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
                {messageCost && (
                    <PortalTooltip content={messageCost.tooltip} enterDelay={300}>
                        <span className="text-[10px] text-text-tertiary select-none cursor-default inline-flex items-center gap-0.5 hover:text-text-secondary transition-colors">
                            ${messageCost.cost.toFixed(4)}
                            {messageCost.cachedPct > 0 && <span className="ml-0.5" style={{ color: 'var(--color-success)' }}>↓{messageCost.cachedPct}%</span>}
                            {messageCost.cost >= EXPENSIVE_MESSAGE_THRESHOLD && (
                                <span className="ml-0.5 text-[9px] font-bold" style={{ color: 'var(--color-error)' }}>$</span>
                            )}
                        </span>
                    </PortalTooltip>
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
    const activeToolCalls = useChatStore(s => s.activeToolCalls);
    const thinkingText = useChatStore(s => s.thinkingText);
    const stoppedResponse = useChatStore(s => s.stoppedResponse);
    const pendingLargePayloadConfirmation = useChatStore(s => s.pendingLargePayloadConfirmation);
    const confirmLargePayload = useChatStore(s => s.confirmLargePayload);
    const dismissLargePayload = useChatStore(s => s.dismissLargePayload);

    // Build video lookup: persistedContext (user-attached) + all tool results.
    // Used by inline mention:// links and ToolCallSummary expanded previews.
    const activeConversationId = useChatStore(s => s.activeConversationId);
    const conversations = useChatStore(s => s.conversations);
    const referenceVideoMap = useMemo<Map<string, VideoCardContext>>(() => {
        const conv = conversations.find(c => c.id === activeConversationId);
        const ctx = conv?.persistedContext;
        const baseMap = ctx && ctx.length > 0 ? buildVideoIdMap(ctx) : new Map<string, VideoCardContext>();

        // Merge video data from tool results (browseChannelVideos, getMultipleVideoDetails, mentionVideo).
        // persistedContext entries are authoritative — tool data only fills gaps.
        const toolMap = buildToolVideoMap(messages);
        for (const [videoId, toolEntry] of toolMap) {
            if (!baseMap.has(videoId)) {
                baseMap.set(videoId, toolEntry);
            }
        }

        return baseMap;
    }, [activeConversationId, conversations, messages]);

    // Layer 4: Memory checkpoints for this conversation
    const memories = useChatStore(s => s.memories);
    const updateMemory = useChatStore(s => s.updateMemory);
    const deleteMemory = useChatStore(s => s.deleteMemory);
    const conversationMemories = useMemo(() =>
        memories.filter(m => m.conversationId === activeConversationId),
        [memories, activeConversationId]
    );

    // --- Scroll State Machine (extracted to dedicated hook) ---
    const lastMsg = messages[messages.length - 1];
    const {
        containerRef, pinAnchorRef, spacerRef, bottomRef,
        showScrollFab, scrollToBottom, handleScroll,
    } = useChatScroll({
        messageCount: messages.length,
        isStreaming,
        streamingText,
        lastMessageRole: lastMsg?.role,
    });

    // Animation tracking — determines whether to skip entrance animation.
    // Uses React's "adjusting state based on props" pattern (setState during render)
    // to track previous values without extra render cycles.

    // 1. Reconciliation detection: message count didn't grow (ID swap, not new message)
    const [prevMsgCount, setPrevMsgCount] = useState(messages.length);
    let skipAnimateReconciled = false;
    if (messages.length !== prevMsgCount) {
        setPrevMsgCount(messages.length);
    } else if (messages.length > 0) {
        skipAnimateReconciled = true;
    }

    // 2. recentlyStreamed: true for ~1s after streaming ends so the persisted
    // model message appears without entrance animation blink.
    const [recentlyStreamed, setRecentlyStreamed] = useState(false);
    const [prevIsStreaming, setPrevIsStreaming] = useState(isStreaming);
    if (isStreaming !== prevIsStreaming) {
        setPrevIsStreaming(isStreaming);
        // Transition: streaming → not streaming → arm the flag
        if (!isStreaming) {
            setRecentlyStreamed(true);
        }
    }
    useEffect(() => {
        if (!recentlyStreamed) return;
        const timer = setTimeout(() => setRecentlyStreamed(false), 1000);
        return () => clearTimeout(timer);
    }, [recentlyStreamed]);

    const failedMessageId = useChatStore(s => s.lastFailedRequest?.messageId);
    const retryLastMessage = useChatStore(s => s.retryLastMessage);
    const setEditingMessage = useChatStore(s => s.setEditingMessage);
    const debouncedStreamingText = useDebouncedMarkdown(streamingText, 150);

    // Filter out hidden messages (deleted, error, superseded stopped)
    // Must be before early return to comply with Rules of Hooks
    const visibleMessages = useMemo(() =>
        messages.filter(msg => shouldShowMessage(msg, messages)),
        [messages]
    );

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

    // --- Skip entrance animation in two cases: ---
    // 1. Model message that just appeared after streaming ended (recentlyStreamed stays
    //    true for ~1s after streaming ends so the Firestore message arrives without blink).
    // 2. User message that was reconciled (optimistic -> Firestore): detected when count
    //    didn't grow (same length = ID swap, not a new message).
    const lastMsgIndex = visibleMessages.length - 1;
    const skipAnimateLastModel = (recentlyStreamed || isStreaming) && visibleMessages[lastMsgIndex]?.role === 'model';

    return (
        <div className="chat-messages flex-1 min-h-0 overflow-y-auto px-3.5 pt-3.5 pb-1 flex flex-col gap-3" ref={containerRef} onScroll={handleScroll}>
            {visibleMessages.map((msg, idx) => {
                // Render memory checkpoints between messages (by timestamp)
                const checkpointsBefore = conversationMemories.filter(m => {
                    if (!m.createdAt?.toMillis || !msg.createdAt?.toMillis) return false;
                    const memTime = m.createdAt.toMillis();
                    const msgTime = msg.createdAt.toMillis();
                    const prevTime = idx > 0
                        ? visibleMessages[idx - 1].createdAt?.toMillis() ?? 0
                        : 0;
                    return memTime > prevTime && memTime <= msgTime;
                });

                return (
                    <React.Fragment key={msg.id}>
                        {checkpointsBefore.map(mem => (
                            <MemoryCheckpoint
                                key={`checkpoint-${mem.id}`}
                                memory={mem}
                                onUpdate={updateMemory}
                                onDelete={deleteMemory}
                            />
                        ))}
                        <MessageErrorBoundary messageId={msg.id}>
                            <MessageItem
                                msg={msg}
                                modelPricing={modelPricing}
                                skipAnimation={skipAnimateReconciled || (idx === lastMsgIndex && skipAnimateLastModel)}
                                isFailed={msg.role === 'user' && failedMessageId === msg.id}
                                isStreaming={isStreaming}
                                onRetry={retryLastMessage}
                                onEdit={setEditingMessage}
                                videoMap={referenceVideoMap}
                                sessionThinking={
                                    msg.role === 'model'
                                        ? getSessionThinking(msg.id)
                                        : null
                                }
                            />
                        </MessageErrorBoundary>
                    </React.Fragment>
                );
            })}

            {/* Checkpoints after last message */}
            {conversationMemories.filter(m => {
                if (!m.createdAt?.toMillis || visibleMessages.length === 0) return false;
                const lastMsg = visibleMessages[visibleMessages.length - 1];
                return m.createdAt.toMillis() > (lastMsg.createdAt?.toMillis() ?? 0);
            }).map(mem => (
                <MemoryCheckpoint
                    key={`checkpoint-${mem.id}`}
                    memory={mem}
                    onUpdate={updateMemory}
                    onDelete={deleteMemory}
                />
            ))}

            {/* Pin anchor — invisible sentinel for pin-to-top scroll position */}
            <div ref={pinAnchorRef} className="h-0 -mt-3" />

            {/* Streaming message */}
            {isStreaming && (
                <div className="chat-message flex flex-col max-w-[85%] self-start animate-message-in mb-2">
                    <div className={MSG_BUBBLE_MODEL}>
                        {/* Progressive status — shown when no text or thinking has arrived yet */}
                        <StreamingStatusMessage />

                        {/* Thinking bubble — collapsible, before tool calls and text */}
                        {thinkingText && (
                            <ThinkingBubble text={thinkingText} isStreaming={isStreaming} />
                        )}

                        {/* Tool call summary — between thinking and text */}
                        {activeToolCalls.length > 0 && (
                            <ToolCallSummary toolCalls={activeToolCalls} videoMap={referenceVideoMap} isStreaming />
                        )}

                        {streamingText ? (
                            <div className="animate-fade-in">
                                {debouncedStreamingText ? <MarkdownMessage text={debouncedStreamingText} videoMap={referenceVideoMap} /> : <span className="whitespace-pre-wrap">{streamingText}</span>}
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

            {/* Ghost message — partial AI response after user clicked Stop (session-only) */}
            {!isStreaming && stoppedResponse && (
                <div className="chat-message flex flex-col max-w-[85%] self-start mb-2 opacity-60">
                    <div className={`${MSG_BUBBLE_MODEL} border border-border`}>
                        {stoppedResponse.thinking && (
                            <ThinkingBubble text={stoppedResponse.thinking} isStreaming={false} />
                        )}
                        {stoppedResponse.toolCalls.length > 0 && (
                            <ToolCallSummary toolCalls={stoppedResponse.toolCalls} videoMap={referenceVideoMap} isStreaming={false} />
                        )}
                        {stoppedResponse.text && (
                            <MarkdownMessage text={stoppedResponse.text} videoMap={referenceVideoMap} />
                        )}
                        <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-border text-text-tertiary text-[11px]">
                            <Square size={10} />
                            <span>Generation stopped</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Thumbnail batch confirmation — shown below streaming message when middleware blocks */}
            {pendingLargePayloadConfirmation && (
                <div className="self-start max-w-[85%] mb-2 animate-fade-in">
                    <ConfirmLargePayloadBanner
                        count={pendingLargePayloadConfirmation.count}
                        onConfirm={confirmLargePayload}
                        onDismiss={dismissLargePayload}
                    />
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

            {/* Selection toolbar for Save to Video/Canvas */}
            <SelectionToolbar messages={messages} scrollContainerRef={containerRef} />
        </div>
    );
};
