import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { formatRelativeTime } from '../formatRelativeTime';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
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

/** Single conversation row — two-line layout */
const ConversationItem: React.FC<{
    conv: ChatConversation;
    isActive: boolean;
    isEditing: boolean;
    editingTitle: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onSelect: () => void;
    onDelete?: () => void;
    onRename?: () => void;
    onEditChange: (v: string) => void;
    onEditCommit: () => void;
    onEditCancel: () => void;
}> = ({ conv, isActive, isEditing, editingTitle, inputRef, onSelect, onDelete, onRename, onEditChange, onEditCommit, onEditCancel }) => {
    const nameRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        const el = nameRef.current;
        if (!el) return;
        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [conv.title]);

    const itemBase = "group relative flex items-center gap-2.5 py-2 px-2.5 rounded-lg cursor-pointer transition-colors duration-100 border-none bg-transparent w-full text-left text-text-secondary text-[13px] hover:bg-hover-bg hover:text-text-primary";
    const actionBtnClass = "opacity-0 group-hover:opacity-100 bg-transparent border-none p-1 rounded cursor-pointer text-text-tertiary flex shrink-0 transition-all duration-100 hover:text-text-primary";

    return (
        <div
            className={`${itemBase} ${isActive ? 'bg-card-bg text-text-primary' : ''} ${isEditing ? '!bg-hover-bg !text-text-primary' : ''}`}
            onClick={() => !isEditing && onSelect()}
        >
            <MessageSquare size={16} className="shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                {/* Title line */}
                <div className="relative flex items-center min-w-0 pr-12">
                    <PortalTooltip
                        content={<span className="whitespace-nowrap">{conv.title}</span>}
                        triggerClassName="min-w-0 flex-1 !justify-start"
                        enterDelay={500}
                        disabled={!isTruncated || isEditing}
                    >
                        <span
                            ref={nameRef}
                            className={`block truncate text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors duration-150 ${isEditing ? 'opacity-0' : ''}`}
                        >
                            {conv.title}
                        </span>
                    </PortalTooltip>
                    {isEditing && (
                        <input
                            ref={inputRef}
                            className="absolute inset-0 p-0 text-sm font-medium bg-transparent border-0 border-b border-text-tertiary outline-none text-text-primary font-[inherit]"
                            value={editingTitle}
                            onChange={(e) => onEditChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onEditCommit();
                                if (e.key === 'Escape') onEditCancel();
                            }}
                            onBlur={onEditCommit}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
                {/* Timestamp line */}
                <span className={`text-xs text-text-tertiary select-none cursor-default group-hover:text-text-secondary transition-colors duration-150 ${isEditing ? 'opacity-0' : ''}`}>
                    {formatRelativeTime(conv.updatedAt)}
                </span>
            </div>

            {/* Action buttons — top right */}
            <div className={`flex gap-0 shrink-0 transition-opacity duration-150 ${isEditing ? 'opacity-0' : ''}`}>
                {onRename && (
                    <button
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); onRename(); }}
                        title="Rename chat"
                    >
                        <Pencil size={14} />
                    </button>
                )}
                {onDelete && (
                    <button
                        className={`${actionBtnClass} hover:!text-red-400`}
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        title="Delete chat"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

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

    const startEditing = useCallback((conv: ChatConversation) => {
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

    return (
        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col chat-list-container">
            {conversations.map((conv) => (
                <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === activeConversationId}
                    isEditing={editingId === conv.id}
                    editingTitle={editingTitle}
                    inputRef={inputRef}
                    onSelect={() => onSelect(conv.id)}
                    onDelete={onDelete ? () => onDelete(conv.id) : undefined}
                    onRename={onRename ? () => startEditing(conv) : undefined}
                    onEditChange={setEditingTitle}
                    onEditCommit={commitRename}
                    onEditCancel={cancelEditing}
                />
            ))}

            {hasMore && onLoadMore && (
                <button className="flex items-center justify-center gap-1.5 p-2 bg-transparent border-none text-text-tertiary text-xs cursor-pointer transition-colors duration-100 shrink-0 hover:text-text-primary" onClick={onLoadMore}>
                    <ChevronDown size={14} /> Load older conversations
                </button>
            )}

            {conversations.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-tertiary text-[13px] text-center p-6">
                    <MessageSquare size={32} className="opacity-35" />
                    <span className="select-none">No conversations yet.<br />Click + to start one.</span>
                </div>
            )}
        </div>
    );
};
