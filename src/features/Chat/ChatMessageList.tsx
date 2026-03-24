// =============================================================================
// AI CHAT: Message List Component
// =============================================================================

import React, { useEffect, useRef, useMemo, useState } from 'react';
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
import { buildVideoIdMap } from '../../core/utils/buildReferenceMap';
import type { VideoPreviewData } from '../Video/types';
import { toPreviewData } from './utils/toPreviewData';

import { getEffectiveDisplayLevel } from './utils/tokenDisplay';
import { EXPENSIVE_MESSAGE_THRESHOLD } from './hooks/useCostAlerts';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { MemoryCheckpoint } from './components/MemoryCheckpoint';
import { useKnowledgeCatalog } from '../../core/hooks/useKnowledgeCatalog';
import { FileAudio, FileVideo, File, Copy, Check, ArrowDown, RotateCcw, MessageCircle, Pencil, Square } from 'lucide-react';
import { CopyButton } from '../../components/ui/atoms/CopyButton';
import { useChatStore } from '../../core/stores/chat/chatStore';
import { VID_RE, KI_RE } from '../../core/config/referencePatterns';
import { buildCatalogKiMap } from '../../components/ui/organisms/RichTextEditor/utils/catalogMaps';
import { ReferenceLink } from '../../components/ui/organisms/RichTextEditor/components/ReferenceLink';
import type { KiPreviewData } from '../../components/ui/organisms/RichTextEditor/types';
import { useRelativeTime } from './useRelativeTime';
import { normalizeMarkdown } from './utils/normalizeMarkdown';
import { buildToolVideoMap } from './utils/buildToolVideoMap';
import { linkifyVideoIds } from '../../core/utils/linkifyVideoIds';
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

/** Regex to detect mention:// URIs in markdown links (tolerates extra slashes/spaces from LLM) */
const MENTION_RE = /^mention:\/{2,}\s*(.+)$/;

/** Pre-process: fix malformed mention URLs that CommonMark won't parse (spaces, extra slashes) */
const MENTION_URL_FIX_RE = /\]\(mention:\/{2,}\s+/g;
/** Ensure a space before mention links when LLM omits it (e.g. "растёт[title]" → "растёт [title]").
 *  Excludes * and _ so that **[title](mention://...)** bold/italic wrapping is preserved. */
const MENTION_SPACE_RE = /([^\s*_])\[([^\]]+)\]\(mention:\/\//g;

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
        <div className="chat-code-block my-2.5 rounded-lg overflow-hidden border border-border">
            <div className="chat-code-header flex items-center justify-between px-3 py-1.5 bg-surface-secondary border-b border-border">
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
}

const MarkdownMessage: React.FC<{ text: string; videoMap?: Map<string, VideoPreviewData>; kiMap?: Map<string, KiPreviewData> }> = React.memo(({ text, videoMap, kiMap }) => {
    // Fix malformed mention:// URLs before markdown parsing (LLMs add spaces/extra slashes)
    const sanitized = text
        .replace(MENTION_URL_FIX_RE, '](mention://')
        .replace(MENTION_SPACE_RE, '$1 [$2](mention://');

    // Enrich known video IDs with interactive mention:// badges
    const autoLinked = videoMap ? linkifyVideoIds(sanitized, videoMap, 'mention') : sanitized;

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            // Allow mention://, vid://, ki:// URIs through the URL sanitizer
            urlTransform={(url) => {
                if (MENTION_RE.test(url) || VID_RE.test(url) || KI_RE.test(url)) return url;
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
                    return <ReferenceLink href={href} videoMap={videoMap} kiMap={kiMap}>{children}</ReferenceLink>;
                },
            }}
        >
            {normalizeMarkdown(autoLinked)}
        </ReactMarkdown>
    );
});
MarkdownMessage.displayName = 'MarkdownMessage';

// --- Shared bubble class constants (DRY) ---
const MSG_BUBBLE_BASE = 'chat-message-bubble py-2 px-3.5 rounded-xl text-[13px] leading-normal break-words';
const MSG_BUBBLE_USER = `${MSG_BUBBLE_BASE} bg-surface-secondary text-text-primary rounded-br-sm`;
const MSG_BUBBLE_MODEL = `${MSG_BUBBLE_BASE} bg-surface-secondary text-text-primary rounded-bl-sm`;

// --- Debounced markdown for streaming ---
function useDebouncedMarkdown(text: string | null, delay: number): string | null {
    const [debounced, setDebounced] = useState(text);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(text), delay);
        return () => clearTimeout(id);
    }, [text, delay]);
    return debounced;
}


// --- Message Item ---

interface MessageItemProps {
    msg: ChatMessage;
    skipAnimation?: boolean;
    isFailed?: boolean;
    isStreaming?: boolean;
    onRetry?: () => void;
    onEdit?: (msg: ChatMessage) => void;
    videoMap?: Map<string, VideoPreviewData>;
    kiMap?: Map<string, KiPreviewData>;
    /** Session-only thinking data (not persisted, shown only for last model msg) */
    sessionThinking?: { text: string; elapsedMs: number } | null;
}

const MessageItem: React.FC<MessageItemProps> = React.memo(({ msg, skipAnimation, isFailed, isStreaming, onRetry, onEdit, videoMap, kiMap, sessionThinking }) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const timestamp = useRelativeTime(msg.createdAt);

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
                    `Input: ${totalInput.toLocaleString()} tokens${cachedTokens ? ` (${cachedTokens.toLocaleString()} cached)` : ''}`,
                    `Output: ${nu.billing.output.total.toLocaleString()} tokens${nu.billing.output.thinking > 0 && (level === 'detailed' || level === 'debug') ? ` (${nu.billing.output.thinking.toLocaleString()} thinking)` : ''}`,
                );
            }

            // detailed+: thinking, iterations, tool calls
            if ((level === 'detailed' || level === 'debug') && nu.billing.iterations > 1) {
                const toolCount = msg.toolCalls?.length ?? 0;
                lines.push(`Tool calls: ${toolCount} (${nu.billing.iterations} iterations)`);
            }

            return { cost: costTotal, cachedPct, tooltip: lines.join('\n') };
        }

        return null;
    }, [msg.role, msg.normalizedUsage, msg.toolCalls]);

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
                    <ToolCallSummary toolCalls={msg.toolCalls} videoMap={videoMap} stopped={msg.status === 'stopped'} />
                )}
                <MarkdownMessage text={msg.text} videoMap={videoMap} kiMap={kiMap} />
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
                    <CopyButton text={msg.text} title="Copy message" />
                )}
                {msg.role === 'user' && !isFailed && !isStreaming && !msg.text.startsWith('Memorize') && (
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
}) => {
    const streamingText = useChatStore(s => s.streamingText);
    const isStreaming = useChatStore(s => s.isStreaming);
    const activeToolCalls = useChatStore(s => s.activeToolCalls);
    const thinkingText = useChatStore(s => s.thinkingText);
    const stoppedResponse = useChatStore(s => s.stoppedResponse);
    const pendingLargePayloadConfirmation = useChatStore(s => s.pendingLargePayloadConfirmation);
    const confirmLargePayload = useChatStore(s => s.confirmLargePayload);
    const dismissLargePayload = useChatStore(s => s.dismissLargePayload);

    // Build video lookup: persistedContext (user-attached) + tool results + @-mentions.
    // Used by inline mention:// / vid:// links and ToolCallSummary expanded previews.
    const activeConversationId = useChatStore(s => s.activeConversationId);
    const conversations = useChatStore(s => s.conversations);
    const referenceVideoMap = useMemo<Map<string, VideoPreviewData>>(() => {
        const conv = conversations.find(c => c.id === activeConversationId);
        const ctx = conv?.persistedContext;

        // Layer 1: Convert persisted VideoCardContext entries to VideoPreviewData
        const baseMap = new Map<string, VideoPreviewData>();
        if (ctx && ctx.length > 0) {
            for (const [videoId, card] of buildVideoIdMap(ctx)) {
                baseMap.set(videoId, toPreviewData(card));
            }
        }

        // Layer 2: Merge video data from tool results.
        // persistedContext entries are authoritative — tool data only fills gaps.
        const toolMap = buildToolVideoMap(messages);
        for (const [videoId, toolEntry] of toolMap) {
            if (!baseMap.has(videoId)) {
                baseMap.set(videoId, toolEntry);
            }
        }

        // Layer 3: @-mentioned videos (resolved from videoCatalog at send time).
        // Fills gaps for vid:// links in user messages that aren't in Layers 1-2.
        for (const msg of messages) {
            if (msg.mentionedVideos) {
                for (const v of msg.mentionedVideos) {
                    if (!baseMap.has(v.videoId)) {
                        baseMap.set(v.videoId, v);
                    }
                }
            }
        }

        return baseMap;
    }, [activeConversationId, conversations, messages]);

    // Layer 4: Memory checkpoints for this conversation
    const memories = useChatStore(s => s.memories);
    const updateMemory = useChatStore(s => s.updateMemory);
    const deleteMemory = useChatStore(s => s.deleteMemory);
    const knowledgeCatalog = useKnowledgeCatalog();
    const referenceKiMap = useMemo(() => buildCatalogKiMap(knowledgeCatalog), [knowledgeCatalog]);
    // Manual memories (conversationId undefined) are excluded by design — they appear only in Settings
    const conversationMemories = useMemo(() =>
        memories.filter(m => m.conversationId === activeConversationId),
        [memories, activeConversationId]
    );

    // --- Scroll State Machine (extracted to dedicated hook) ---
    const lastMsg = messages[messages.length - 1];
    const {
        containerRef, stickyZoneRef, bottomRef,
        showScrollFab, isPinned, scrollToBottom, handleScroll,
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

    // Split point: last user message. Messages from here onward render inside
    // the sticky zone. splitIndex is independent of isPinned — messages never
    // move between segments when pin toggles (avoids React remount).
    const splitIndex = useMemo(() => {
        for (let i = visibleMessages.length - 1; i >= 0; i--) {
            if (visibleMessages[i].role === 'user') return i;
        }
        return visibleMessages.length; // no user messages → all in pre-zone
    }, [visibleMessages]);

    // Pre-compute checkpoint→message mapping (O(N+M) instead of O(N×M) per render)
    const checkpointMap = useMemo(() => {
        const map = new Map<string, typeof conversationMemories>();
        if (conversationMemories.length === 0) return map;
        for (let i = 0; i < visibleMessages.length; i++) {
            const msgTime = visibleMessages[i].createdAt?.toMillis() ?? 0;
            const prevTime = i > 0 ? visibleMessages[i - 1].createdAt?.toMillis() ?? 0 : 0;
            const matches = conversationMemories.filter(m => {
                if (!m.createdAt?.toMillis) return false;
                const memTime = m.createdAt.toMillis();
                return memTime > prevTime && memTime <= msgTime;
            });
            if (matches.length > 0) map.set(visibleMessages[i].id, matches);
        }
        return map;
    }, [visibleMessages, conversationMemories]);

    if (messages.length === 0 && !isStreaming) {
        return (
            <div className="chat-messages flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3.5 pt-3.5 pb-1 flex flex-col gap-3">
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
        <div className="chat-messages flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3.5 pt-3.5 pb-1 flex flex-col gap-3" ref={containerRef} onScroll={handleScroll}>
            {/* Pre-zone messages: everything before the last user message */}
            {visibleMessages.slice(0, splitIndex).map((msg, idx) => {
                const checkpointsBefore = checkpointMap.get(msg.id) ?? [];
                return (
                    <React.Fragment key={msg.id}>
                        {checkpointsBefore.map(mem => (
                            <MemoryCheckpoint
                                key={`checkpoint-${mem.id}`}
                                memory={mem}
                                onUpdate={updateMemory}
                                onDelete={deleteMemory}
                                knowledgeCatalog={knowledgeCatalog}
                            />
                        ))}
                        <MessageErrorBoundary messageId={msg.id}>
                            <MessageItem
                                msg={msg}
                                skipAnimation={skipAnimateReconciled || (idx === lastMsgIndex && skipAnimateLastModel)}
                                isFailed={msg.role === 'user' && failedMessageId === msg.id}
                                isStreaming={isStreaming}
                                onRetry={retryLastMessage}
                                onEdit={setEditingMessage}
                                videoMap={referenceVideoMap}
                                kiMap={referenceKiMap}
                                sessionThinking={
                                    msg.role === 'model'
                                        ? (msg.thinking
                                            ? { text: msg.thinking, elapsedMs: msg.thinkingElapsedMs ?? 0 }
                                            : getSessionThinking(msg.id))
                                        : null
                                }
                            />
                        </MessageErrorBoundary>
                    </React.Fragment>
                );
            })}

            {/* Sticky zone: last user message + streaming response + trailing content.
                When isPinned, gets position:sticky via .chat-sticky-zone class.
                When not pinned, transparent flex wrapper — no layout effect. */}
            <div
                ref={stickyZoneRef}
                className={`flex flex-col gap-3 ${isPinned ? 'chat-sticky-zone' : ''}`}
                style={{ overflowAnchor: 'none' }}
            >
                {/* Zone messages: last user msg + any model responses after it */}
                {visibleMessages.slice(splitIndex).map((msg, idx) => {
                    const globalIdx = splitIndex + idx;
                    const checkpointsBefore = checkpointMap.get(msg.id) ?? [];
                    return (
                        <React.Fragment key={msg.id}>
                            {checkpointsBefore.map(mem => (
                                <MemoryCheckpoint
                                    key={`checkpoint-${mem.id}`}
                                    memory={mem}
                                    onUpdate={updateMemory}
                                    onDelete={deleteMemory}
                                    knowledgeCatalog={knowledgeCatalog}
                                />
                            ))}
                            <MessageErrorBoundary messageId={msg.id}>
                                <MessageItem
                                    msg={msg}
                                    skipAnimation={skipAnimateReconciled || (globalIdx === lastMsgIndex && skipAnimateLastModel)}
                                    isFailed={msg.role === 'user' && failedMessageId === msg.id}
                                    isStreaming={isStreaming}
                                    onRetry={retryLastMessage}
                                    onEdit={setEditingMessage}
                                    videoMap={referenceVideoMap}
                                    kiMap={referenceKiMap}
                                    sessionThinking={
                                        msg.role === 'model'
                                            ? (msg.thinking
                                                ? { text: msg.thinking, elapsedMs: msg.thinkingElapsedMs ?? 0 }
                                                : getSessionThinking(msg.id))
                                            : null
                                    }
                                />
                            </MessageErrorBoundary>
                        </React.Fragment>
                    );
                })}

                {/* Trailing checkpoints (after last message, inside zone) */}
                {conversationMemories.filter(m => {
                    if (!m.createdAt?.toMillis || visibleMessages.length === 0) return false;
                    const lastVisibleMsg = visibleMessages[visibleMessages.length - 1];
                    return m.createdAt.toMillis() > (lastVisibleMsg.createdAt?.toMillis() ?? 0);
                }).map(mem => (
                    <MemoryCheckpoint
                        key={`checkpoint-${mem.id}`}
                        memory={mem}
                        onUpdate={updateMemory}
                        onDelete={deleteMemory}
                        knowledgeCatalog={knowledgeCatalog}
                    />
                ))}

                {/* Streaming message — suppressed when Firestore model message already arrived
                   (race: Firestore write can land before SSE stream ends → prevents 2-3 frame duplication) */}
                {isStreaming && visibleMessages[visibleMessages.length - 1]?.role !== 'model' && (
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
                                    {debouncedStreamingText ? <MarkdownMessage text={debouncedStreamingText} videoMap={referenceVideoMap} kiMap={referenceKiMap} /> : <span className="whitespace-pre-wrap">{streamingText}</span>}
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
                                <ThinkingBubble text={stoppedResponse.thinking} isStreaming={false} initialElapsedMs={stoppedResponse.thinkingElapsedMs} />
                            )}
                            {stoppedResponse.toolCalls.length > 0 && (
                                <ToolCallSummary toolCalls={stoppedResponse.toolCalls} videoMap={referenceVideoMap} stopped />
                            )}
                            {stoppedResponse.text && (
                                <MarkdownMessage text={stoppedResponse.text} videoMap={referenceVideoMap} kiMap={referenceKiMap} />
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
            </div>

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
