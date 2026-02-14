// =============================================================================
// Chat Navigation — view switching, back button, project editing
// =============================================================================

import { useCallback, useState } from 'react';
import type { ChatProject, ChatView } from '../../../core/types/chat';

interface UseChatNavigationOpts {
    projects: ChatProject[];
    view: ChatView;
    activeProjectId: string | null;
    setView: (view: ChatView) => void;
    setActiveProject: (id: string | null) => void;
    setActiveConversation: (id: string | null) => void;
    clearAndCleanup: () => void;
}

interface UseChatNavigationReturn {
    editingProjectId: string | null;
    editingProject: ChatProject | null;
    isCreatingProject: boolean;
    setEditingProjectId: (id: string | null) => void;
    setIsCreatingProject: (v: boolean) => void;
    pendingDelete: { type: 'project' | 'conversation'; id: string; name: string } | null;
    setPendingDelete: (v: { type: 'project' | 'conversation'; id: string; name: string } | null) => void;
    handleBack: () => void;
}

export function useChatNavigation(opts: UseChatNavigationOpts): UseChatNavigationReturn {
    const { projects, view, activeProjectId, setView, setActiveProject, setActiveConversation, clearAndCleanup } = opts;

    // Inline project creation
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const editingProject = editingProjectId ? projects.find(p => p.id === editingProjectId) ?? null : null;

    // Deletion confirmation
    const [pendingDelete, setPendingDelete] = useState<{ type: 'project' | 'conversation'; id: string; name: string } | null>(null);

    // Back navigation
    const handleBack = useCallback(() => {
        if (editingProjectId) setEditingProjectId(null);
        else if (view === 'chat') { clearAndCleanup(); setActiveConversation(null); }
        else if (view === 'conversations' && activeProjectId) { setActiveProject(null); setView('projects'); }
    }, [editingProjectId, view, activeProjectId, setActiveConversation, setActiveProject, setView, clearAndCleanup]);

    return {
        editingProjectId,
        editingProject,
        isCreatingProject,
        setEditingProjectId,
        setIsCreatingProject,
        pendingDelete,
        setPendingDelete,
        handleBack,
    };
}
