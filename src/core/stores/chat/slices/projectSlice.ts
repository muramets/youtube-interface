// =============================================================================
// Project Slice — chat projects CRUD + pending model/thinking overrides
// =============================================================================

import type { ChatProject } from '../../../types/chat/chat';
import { ChatService } from '../../../services/ai/chatService';
import type { ChatState } from '../types';
import { requireContext } from '../helpers';

export function createProjectSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'projects'
    | 'pendingModel'
    | 'pendingThinkingOptionId'
    | 'subscribeToProjects'
    | 'createProject'
    | 'updateProject'
    | 'deleteProject'
    | 'setPendingModel'
    | 'setPendingThinkingOptionId'
> {
    return {
        // State
        projects: [],
        pendingModel: null,
        pendingThinkingOptionId: null,

        // Actions
        subscribeToProjects: () => {
            const { userId, channelId } = requireContext(get);
            return ChatService.subscribeToProjects(userId, channelId, (projects) => {
                set({ projects });
            });
        },

        createProject: async (name: string): Promise<ChatProject> => {
            const { userId, channelId } = requireContext(get);
            const { projects } = get();
            const order = projects.length;
            return ChatService.createProject(userId, channelId, name, order);
        },

        updateProject: async (projectId, updates) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.updateProject(userId, channelId, projectId, updates);
        },

        deleteProject: async (projectId) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.deleteProject(userId, channelId, projectId);
            const { activeProjectId } = get();
            if (activeProjectId === projectId) {
                set({ activeProjectId: null });
            }
        },

        setPendingModel: (model) => set({ pendingModel: model, pendingThinkingOptionId: null }),
        setPendingThinkingOptionId: (level) => set({ pendingThinkingOptionId: level }),
    };
}
