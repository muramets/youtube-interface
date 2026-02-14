import React, { useState, useCallback, useRef } from 'react';
import { MessageSquare, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { formatRelativeTime } from '../formatRelativeTime';
import type { ChatConversation } from '../../../core/types/chat';

interface ConversationListProps {
    conversations: ChatConversation[];
    activeConversationId: string | null;
    onSelect: (id: string) => void;
    onDelete?: (id: string) => void;
    onRename?: (id: string, title: string) => void;
    hasMore?: boolean;
    onLoadMore?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
    conversations,
    activeConversationId,
    onSelect,
    onDelete,
    onRename,
    hasMore,
    onLoadMore,
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const startEditing = useCallback((e: React.MouseEvent, conv: ChatConversation) => {
        e.stopPropagation();
        setEditingId(conv.id);
        setEditingTitle(conv.title);
        setTimeout(() => inputRef.current?.select(), 0);
    }, []);

    const commitRename = useCallback(() => {
        if (editingId && editingTitle.trim() && onRename) {
            onRename(editingId, editingTitle.trim());
        }
        setEditingId(null);
    }, [editingId, editingTitle, onRename]);

    const cancelEditing = useCallback(() => {
        setEditingId(null);
    }, []);

    const itemBase = "group flex items-center gap-2.5 py-2 px-2.5 rounded-lg cursor-pointer transition-colors duration-100 border-none bg-transparent w-full text-left text-text-secondary text-[13px] hover:bg-hover-bg hover:text-text-primary";
    const actionBtnClass = "opacity-0 group-hover:opacity-100 bg-transparent border-none p-1 rounded cursor-pointer text-text-tertiary flex shrink-0 transition-all duration-100 hover:text-text-primary";

    return (
        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col chat-list-container">
            {conversations.map((conv) => (
                <div
                    key={conv.id}
                    className={`${itemBase} ${conv.id === activeConversationId ? 'bg-card-bg text-text-primary' : ''}`}
                    onClick={() => editingId !== conv.id && onSelect(conv.id)}
                >
                    <MessageSquare size={16} />
                    {editingId === conv.id ? (
                        <input
                            ref={inputRef}
                            className="flex-1 min-w-0 text-[13px] py-0.5 px-1.5 border border-accent rounded bg-input-bg text-text-primary outline-none"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') cancelEditing();
                            }}
                            onBlur={commitRename}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <>
                            <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{conv.title}</span>
                            <span className="text-[11px] text-text-tertiary whitespace-nowrap">{formatRelativeTime(conv.updatedAt)}</span>
                        </>
                    )}
                    {editingId !== conv.id && (
                        <>
                            {onRename && (
                                <button
                                    className={actionBtnClass}
                                    onClick={(e) => startEditing(e, conv)}
                                    title="Rename chat"
                                >
                                    <Pencil size={14} />
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    className={`${actionBtnClass} hover:!text-[var(--danger-color,#cc0000)]`}
                                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                                    title="Delete chat"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            ))}

            {hasMore && onLoadMore && (
                <button className="flex items-center justify-center gap-1.5 p-2 bg-transparent border-none text-text-tertiary text-xs cursor-pointer transition-colors duration-100 shrink-0 hover:text-text-primary" onClick={onLoadMore}>
                    <ChevronDown size={14} /> Load older conversations
                </button>
            )}

            {conversations.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-tertiary text-[13px] text-center p-6">
                    <MessageSquare size={32} className="opacity-35" />
                    <span>No conversations yet.<br />Click + to start one.</span>
                </div>
            )}
        </div>
    );
};
