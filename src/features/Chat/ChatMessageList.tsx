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
import type { ModelPricing } from '../../../shared/models';
import { estimateCostEur } from '../../../shared/models';
import { FileAudio, FileVideo, File, Copy, Check, ArrowDown, RotateCcw, Zap, MessageCircle } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useChatStore } from '../../core/stores/chatStore';
import { formatRelativeTime, STATIC_AGE } from './formatRelativeTime';
import { MessageErrorBoundary } from './components/ChatBoundaries';


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

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
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
};

// --- Adaptive timer intervals ---
const TICK_RECENT = 60_000;       // < 1 hour: update every minute
const TICK_HOURS = 600_000;       // 1h – 2 days: update every 10 min

function getTickInterval(createdAt: Timestamp): number | null {
    const age = Date.now() - createdAt.toMillis();
    if (age >= STATIC_AGE) return null;
    return age < 3_600_000 ? TICK_RECENT : TICK_HOURS;
}

// --- Message Item (per-message timer + visibility tracking) ---

const MessageItem: React.FC<{ msg: ChatMessage; modelPricing?: ModelPricing }> = React.memo(({ msg, modelPricing }) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const isVisibleRef = useRef(false);
    const [timestamp, setTimestamp] = useState(() => formatRelativeTime(msg.createdAt));
    const failedMessageId = useChatStore(s => s.lastFailedRequest?.messageId);
    const retryLastMessage = useChatStore(s => s.retryLastMessage);
    const isFailed = msg.role === 'user' && failedMessageId === msg.id;

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
        <div ref={itemRef} className={`chat-message flex flex-col max-w-[85%] animate-message-in ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
            {/* Attachments */}
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

            <div className={`chat-message-bubble py-2 px-3.5 rounded-xl text-[13px] leading-normal break-words ${msg.role === 'user' ? 'bg-[#2a2a2a] text-text-primary rounded-br-sm' : 'bg-bg-secondary text-text-primary rounded-bl-sm'} ${isFailed ? 'border border-red-500/40' : ''}`}>
                {msg.role === 'model' ? <MarkdownMessage text={msg.text} /> : msg.text}
            </div>

            {/* Failed message indicator */}
            {isFailed && (
                <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-red-400">Failed to send</span>
                    <button
                        className="bg-transparent border-none text-red-400 cursor-pointer p-0.5 flex items-center gap-1 hover:text-red-300 transition-colors text-[11px]"
                        onClick={() => retryLastMessage()}
                        title="Retry"
                    >
                        <RotateCcw size={12} /> Retry
                    </button>
                </div>
            )}

            {/* Message footer: timestamp + tokens + copy */}
            <div className="group/msg flex items-center gap-2 mt-0.5 min-h-[20px]">
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
    const [showScrollFab, setShowScrollFab] = useState(false);
    const isNearBottomRef = useRef(true);

    // Timestamps are now managed per-message (adaptive timer + visibility)

    // Auto-scroll only if user is already near the bottom
    useEffect(() => {
        if (isNearBottomRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.length, streamingText]);

    // Track scroll position for FAB and near-bottom detection
    const handleScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setShowScrollFab(distanceFromBottom > 200);
        isNearBottomRef.current = distanceFromBottom <= 150;
    }, []);

    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    if (messages.length === 0 && !isStreaming) {
        return (
            <div className="chat-messages flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
                <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-tertiary text-[13px] text-center p-6 select-none cursor-default">
                    <MessageCircle size={48} strokeWidth={1.5} className="opacity-35" />
                    <span>Start a conversation.<br />You can send text, images, audio, or video.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-messages flex-1 overflow-y-auto p-3.5 flex flex-col gap-3" ref={containerRef} onScroll={handleScroll}>
            {messages.map((msg) => (
                <MessageErrorBoundary key={msg.id} messageId={msg.id}>
                    <MessageItem msg={msg} modelPricing={modelPricing} />
                </MessageErrorBoundary>
            ))}

            {/* Streaming message */}
            {isStreaming && (
                <div className="chat-message flex flex-col max-w-[85%] self-start animate-message-in">
                    <div className="chat-message-bubble py-2 px-3.5 rounded-xl text-[13px] leading-normal break-words bg-bg-secondary text-text-primary rounded-bl-sm">
                        {streamingText ? <MarkdownMessage text={streamingText} /> : null}
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-tertiary animate-stream-pulse ml-1 align-middle" />
                    </div>
                </div>
            )}

            <div ref={bottomRef} />

            {/* Scroll-to-bottom FAB */}
            {showScrollFab && (
                <button className="sticky bottom-2 self-center bg-card-bg border border-border rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-text-secondary shadow-md transition-colors duration-100 z-5 hover:bg-hover hover:text-text-primary" onClick={scrollToBottom} title="Scroll to bottom">
                    <ArrowDown size={16} />
                </button>
            )}
        </div>
    );
};
