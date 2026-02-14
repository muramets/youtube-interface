import React from 'react';
import { ArrowLeft, Plus, FolderOpen, X } from 'lucide-react';

interface ChatHeaderProps {
    view: 'projects' | 'conversations' | 'chat';
    headerTitle: string;
    totalTokens: number;
    contextPercent: number;
    activeProjectId: string | null;
    editingProjectId: string | null;
    onBack: () => void;
    onSwitchToProjects: () => void;
    onCreateNew: () => void;
    onClose?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    view,
    headerTitle,
    totalTokens,
    contextPercent,
    activeProjectId,
    editingProjectId,
    onBack,
    onSwitchToProjects,
    onCreateNew,
    onClose,
}) => {
    const showBack = view === 'chat' || (view === 'conversations' && activeProjectId) || editingProjectId;
    const showProjectsBtn = view === 'conversations';
    const showCreateBtn = !editingProjectId && (view === 'conversations' || view === 'projects');

    const btnClass = "bg-transparent border-none p-1.5 rounded-md text-text-secondary cursor-pointer flex items-center justify-center transition-colors duration-100 hover:bg-hover-bg hover:text-text-primary";

    return (
        <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border bg-card-bg shrink-0">
            {showBack && (
                <button className={btnClass} onClick={onBack} title="Back">
                    <ArrowLeft size={18} />
                </button>
            )}

            <h3 className="flex-1 text-sm font-semibold m-0 text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">{headerTitle}</h3>

            {view === 'chat' && totalTokens > 0 && (
                <span className="text-[11px] text-text-tertiary whitespace-nowrap shrink-0">⚡ {totalTokens.toLocaleString()} ({contextPercent}%)</span>
            )}

            {showProjectsBtn && (
                <button className={btnClass} onClick={onSwitchToProjects} title="Projects">
                    <FolderOpen size={18} />
                </button>
            )}

            {showCreateBtn && (
                <button
                    className={btnClass}
                    onClick={onCreateNew}
                    title={view === 'projects' ? 'New project' : 'New chat'}
                >
                    <Plus size={18} />
                </button>
            )}

            {onClose && (
                <button className={btnClass} onClick={onClose} title="Close chat">
                    <X size={18} />
                </button>
            )}
        </div>
    );
};
