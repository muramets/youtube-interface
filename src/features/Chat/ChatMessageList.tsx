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
import { FileAudio, FileVideo, Copy, Check, ArrowDown } from 'lucide-react';
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
            {copied ? <Check size={14} /> : <Copy size={14} />}
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

const MessageItem: React.FC<{ msg: ChatMessage }> = React.memo(({ msg }) => {
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
                                : <span>📎</span>;
                        return (
                            <div key={att.url || att.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card-bg text-xs text-text-secondary border border-border">
                                {icon}
                                <span>{att.name}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className={`chat-message-bubble py-2 px-3.5 rounded-xl text-[13px] leading-normal break-words ${msg.role === 'user' ? 'bg-card-bg text-text-primary border border-border rounded-br-sm' : 'bg-transparent text-text-primary rounded-bl-sm'}`}>
                {msg.role === 'model' ? <MarkdownMessage text={msg.text} /> : msg.text}
            </div>

            {/* Message footer: timestamp + tokens + copy */}
            <div className="group/msg flex items-center gap-2 mt-0.5 min-h-[20px]">
                <span className="text-[10px] text-text-tertiary opacity-70">
                    {timestamp}
                </span>
                {msg.role === 'model' && msg.tokenUsage && (
                    <span className="text-[10px] text-text-tertiary opacity-70">
                        ⚡ {msg.tokenUsage.totalTokens.toLocaleString()}
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
                <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-tertiary text-[13px] text-center p-6">
                    <svg className="opacity-35" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <span>Start a conversation.<br />You can send text, images, audio, or video.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-messages flex-1 overflow-y-auto p-3.5 flex flex-col gap-3" ref={containerRef} onScroll={handleScroll}>
            {messages.map((msg) => (
                <MessageErrorBoundary key={msg.id} messageId={msg.id}>
                    <MessageItem msg={msg} />
                </MessageErrorBoundary>
            ))}

            {/* Streaming message */}
            {isStreaming && (
                <div className="chat-message flex flex-col max-w-[85%] self-start animate-message-in">
                    <div className="chat-message-bubble py-2 px-3.5 rounded-xl text-[13px] leading-normal break-words bg-transparent text-text-primary rounded-bl-sm">
                        {streamingText ? <MarkdownMessage text={streamingText} /> : null}
                        <span className="chat-streaming-dot" />
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
