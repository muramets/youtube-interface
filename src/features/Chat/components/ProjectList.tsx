import React, { useState, useCallback, useRef } from 'react';
import { FolderOpen, MessageSquare, Settings, Trash2 } from 'lucide-react';
import type { ChatConversation, ChatProject } from '../../../core/types/chat';

interface ProjectListProps {
    projects: ChatProject[];
    conversations: ChatConversation[];
    activeProjectId?: string | null;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onDelete?: (id: string) => void;
    onEdit: (id: string) => void;
    isCreating: boolean;
    onCreateDone: (name: string | null) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
    projects,
    conversations,
    onSelect,
    onSelectAll,
    onDelete,
    onEdit,
    isCreating,
    onCreateDone,
}) => {
    const [newName, setNewName] = useState('');
    const newInputRef = useRef<HTMLInputElement>(null);

    const handleNewInputRef = useCallback((node: HTMLInputElement | null) => {
        newInputRef.current = node;
        if (node) {
            setNewName('');
            setTimeout(() => node.focus(), 0);
        }
    }, []);

    const itemClass = "group flex items-center gap-2.5 py-2 px-2.5 rounded-lg cursor-pointer transition-colors duration-100 border-none bg-transparent w-full text-left text-text-secondary text-[13px] hover:bg-hover-bg hover:text-text-primary";
    const actionBtnClass = "opacity-0 group-hover:opacity-100 bg-transparent border-none p-1 rounded cursor-pointer text-text-tertiary flex shrink-0 transition-all duration-100 hover:text-text-primary";

    return (
        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col">
            {/* Inline create input */}
            {isCreating && (
                <div className={`${itemClass} cursor-default`}>
                    <FolderOpen size={16} />
                    <input
                        ref={handleNewInputRef}
                        className="flex-1 bg-input-bg border border-border rounded-md py-1 px-2 text-[13px] text-text-primary outline-none font-[inherit] transition-colors duration-100 focus:border-text-tertiary placeholder:text-text-tertiary"
                        placeholder="Project name..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newName.trim()) {
                                onCreateDone(newName.trim());
                            } else if (e.key === 'Escape') {
                                onCreateDone(null);
                            }
                        }}
                        onBlur={() => {
                            if (newName.trim()) {
                                onCreateDone(newName.trim());
                            } else {
                                onCreateDone(null);
                            }
                        }}
                    />
                </div>
            )}

            {/* All Chats */}
            <button className={itemClass} onClick={onSelectAll}>
                <MessageSquare size={16} />
                <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">All Chats</span>
                <div className="flex gap-0.5 min-w-[48px] justify-end" />
                <span className="text-[11px] text-text-tertiary whitespace-nowrap select-none cursor-default group-hover:text-text-primary transition-colors">{conversations.length}</span>
            </button>

            {projects.map((project) => {
                const count = conversations.filter((c) => c.projectId === project.id).length;

                return (
                    <div key={project.id} className={itemClass} onClick={() => onSelect(project.id)}>
                        <FolderOpen size={16} />
                        <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{project.name}</span>
                        <div className="flex gap-0.5 min-w-[48px] justify-end">
                            <button
                                className={actionBtnClass}
                                onClick={(e) => { e.stopPropagation(); onEdit(project.id); }}
                                title="Settings"
                            >
                                <Settings size={14} />
                            </button>
                            {onDelete && (
                                <button
                                    className={`${actionBtnClass} hover:!text-red-400`}
                                    onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
                                    title="Delete project"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                        <span className="text-[11px] text-text-tertiary whitespace-nowrap select-none cursor-default group-hover:text-text-primary transition-colors">{count}</span>
                    </div>
                );
            })}

            {projects.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-tertiary text-[13px] text-center p-6 pt-10">
                    <FolderOpen size={32} className="opacity-35" />
                    <span className="select-none">No projects yet.<br />Click + to create one.</span>
                </div>
            )}
        </div>
    );
};
