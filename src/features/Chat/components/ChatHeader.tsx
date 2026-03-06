import React, { useCallback } from 'react';
import { ArrowLeft, Plus, FolderOpen, X, Maximize2, Minimize2 } from 'lucide-react';
import { ChatHeaderStats } from './ChatHeaderStats';

interface ChatHeaderProps {
    view: 'projects' | 'conversations' | 'chat';
    headerTitle: string;
    totalTokens: number;
    contextUsed: number;
    totalCostEur: number;
    totalSavingsEur: number;
    contextPercent: number;
    contextLimit: number;
    modelContextLimit: number;
    activeProjectId: string | null;
    editingProjectId: string | null;
    onBack: () => void;
    onSwitchToProjects: () => void;
    onCreateNew: () => void;
    onClose?: () => void;
    onDragStart?: (e: React.MouseEvent) => void;
    isMaximized?: boolean;
    onToggleMaximize?: () => void;
    onToggleBreakdown?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    view,
    headerTitle,
    totalTokens,
    contextUsed,
    totalCostEur,
    totalSavingsEur,
    contextPercent,
    contextLimit,
    modelContextLimit,
    activeProjectId,
    editingProjectId,
    onBack,
    onSwitchToProjects,
    onCreateNew,
    onClose,
    onDragStart,
    isMaximized,
    onToggleMaximize,
    onToggleBreakdown,
}) => {
    const showBack = view === 'chat' || (view === 'conversations' && activeProjectId) || editingProjectId;
    const showProjectsBtn = view === 'conversations';
    const showCreateBtn = !editingProjectId && (view === 'conversations' || view === 'projects');

    const btnClass = "bg-transparent border-none p-1.5 rounded-md text-text-secondary cursor-pointer flex items-center justify-center transition-colors duration-100 hover:bg-hover-bg hover:text-text-primary";

    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        // Only drag from empty space / title, not from buttons
        if ((e.target as HTMLElement).closest('button')) return;
        onDragStart?.(e);
    }, [onDragStart]);

    return (
        <div
            className="flex items-center gap-2 px-3.5 py-3 border-b border-border bg-card-bg shrink-0 rounded-t-2xl"
            style={{ cursor: onDragStart ? 'move' : undefined }}
            onMouseDown={handleHeaderMouseDown}
        >
            {showBack && (
                <button className={btnClass} onClick={onBack} title="Back">
                    <ArrowLeft size={18} />
                </button>
            )}

            <h3 className="flex-1 text-sm font-semibold m-0 text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">{headerTitle}</h3>

            {view === 'chat' && (
                <ChatHeaderStats
                    contextUsed={contextUsed}
                    contextPercent={contextPercent}
                    contextLimit={contextLimit}
                    modelContextLimit={modelContextLimit}
                    totalCostEur={totalCostEur}
                    totalSavingsEur={totalSavingsEur}
                    totalTokens={totalTokens}
                    onToggleBreakdown={onToggleBreakdown}
                />
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

            {onToggleMaximize && (
                <button className={btnClass} onClick={onToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
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
