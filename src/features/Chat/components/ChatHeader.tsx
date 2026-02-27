import React, { useCallback } from 'react';
import { ArrowLeft, Plus, FolderOpen, X, Zap } from 'lucide-react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';

interface ChatHeaderProps {
    view: 'projects' | 'conversations' | 'chat';
    headerTitle: string;
    totalTokens: number;
    contextUsed: number;
    totalCostEur: number;
    contextPercent: number;
    activeProjectId: string | null;
    editingProjectId: string | null;
    onBack: () => void;
    onSwitchToProjects: () => void;
    onCreateNew: () => void;
    onClose?: () => void;
    onDragStart?: (e: React.MouseEvent) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    view,
    headerTitle,
    totalTokens,
    contextUsed,
    totalCostEur,
    contextPercent,
    activeProjectId,
    editingProjectId,
    onBack,
    onSwitchToProjects,
    onCreateNew,
    onClose,
    onDragStart,
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

            {view === 'chat' && contextUsed > 0 && (
                <span className="text-[11px] text-text-tertiary whitespace-nowrap shrink-0 select-none cursor-default inline-flex items-center gap-0.5 hover:text-text-secondary transition-colors">
                    <Zap size={11} /> {contextUsed.toLocaleString()} ({contextPercent}%)
                    {totalCostEur > 0 && (
                        <PortalTooltip content={`Total tokens: ${totalTokens.toLocaleString()}`} enterDelay={300}>
                            <span className="inline-flex items-center"> • €{totalCostEur.toFixed(4)}</span>
                        </PortalTooltip>
                    )}
                </span>
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
