// =============================================================================
// AI CHAT: Main Chat Panel — Orchestrator
// =============================================================================

import React, { useEffect, useCallback, useRef } from 'react';
import { ChevronUp } from 'lucide-react';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { useChatStore } from '../../core/stores/chatStore';
import { useShallow } from 'zustand/react/shallow';
import { useFileAttachments } from './hooks/useFileAttachments';
import { usePanelResize } from './hooks/usePanelResize';
import { useChatDragDrop } from './hooks/useChatDragDrop';
import { useChatDerivedState } from './hooks/useChatDerivedState';
import { useChatNavigation } from './hooks/useChatNavigation';

import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { ChatHeader } from './components/ChatHeader';
import { ChatContextBar } from './components/ChatContextBar';
import { ChatErrorBanner } from './components/ChatErrorBanner';
import { ProjectList } from './components/ProjectList';
import { ProjectSettings } from './components/ProjectSettings';
import { ConversationList } from './components/ConversationList';
import { ChatSummaryBanner } from './components/ChatSummaryBanner';
import { ChatListErrorBoundary } from './components/ChatBoundaries';
import type { ReadyAttachment } from '../../core/types/chatAttachment';

export const ChatPanel: React.FC<{ onClose?: () => void; hasAudioPlayer?: boolean }> = ({ onClose, hasAudioPlayer }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid ?? null;
    const channelId = currentChannel?.id ?? null;

    // --- Store: data (changes on Firestore updates) ---
    const { projects, conversations, messages, aiSettings } = useChatStore(
        useShallow(s => ({ projects: s.projects, conversations: s.conversations, messages: s.messages, aiSettings: s.aiSettings }))
    );

    // --- Store: navigation (changes on user view switches) ---
    const { view, activeProjectId, activeConversationId } = useChatStore(
        useShallow(s => ({ view: s.view, activeProjectId: s.activeProjectId, activeConversationId: s.activeConversationId }))
    );

    // --- Store: UI state (changes on error / pagination) ---
    const { error, lastFailedRequest, hasMoreMessages, hasMoreConversations } = useChatStore(
        useShallow(s => ({ error: s.error, lastFailedRequest: s.lastFailedRequest, hasMoreMessages: s.hasMoreMessages, hasMoreConversations: s.hasMoreConversations }))
    );

    // --- Store: actions (stable references — never cause re-renders) ---
    const setView = useChatStore(s => s.setView);
    const setActiveProject = useChatStore(s => s.setActiveProject);
    const setActiveConversation = useChatStore(s => s.setActiveConversation);
    const setContext = useChatStore(s => s.setContext);
    const createProject = useChatStore(s => s.createProject);
    const updateProject = useChatStore(s => s.updateProject);
    const deleteProject = useChatStore(s => s.deleteProject);
    const createConversation = useChatStore(s => s.createConversation);
    const deleteConversation = useChatStore(s => s.deleteConversation);
    const renameConversation = useChatStore(s => s.renameConversation);
    const sendMessage = useChatStore(s => s.sendMessage);
    const clearError = useChatStore(s => s.clearError);
    const subscribeToProjects = useChatStore(s => s.subscribeToProjects);
    const subscribeToConversations = useChatStore(s => s.subscribeToConversations);
    const subscribeToMessages = useChatStore(s => s.subscribeToMessages);
    const subscribeToAiSettings = useChatStore(s => s.subscribeToAiSettings);
    const loadOlderMessages = useChatStore(s => s.loadOlderMessages);
    const loadOlderConversations = useChatStore(s => s.loadOlderConversations);
    const retryLastMessage = useChatStore(s => s.retryLastMessage);
    const stopGeneration = useChatStore(s => s.stopGeneration);

    // --- Custom hooks ---
    const { stagedFiles, addFiles, removeFile, clearAll, clearAndCleanup, isAnyUploading } = useFileAttachments(userId ?? undefined, channelId ?? undefined);
    const { panelWidth, panelHeight, isResizing, handleResizeStart } = usePanelResize();
    const { isDragOver, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } = useChatDragDrop(addFiles);

    const {
        editingProjectId, editingProject, isCreatingProject,
        setEditingProjectId, setIsCreatingProject,
        pendingDelete, setPendingDelete, handleBack,
    } = useChatNavigation({
        projects, view, activeProjectId,
        setView, setActiveProject, setActiveConversation, clearAndCleanup,
    });

    const {
        filteredConversations, headerTitle,
        totalTokens, contextUsed, contextPercent, isContextFull,
    } = useChatDerivedState({
        projects, conversations, messages,
        view, activeProjectId, activeConversationId, editingProject,
        defaultModel: aiSettings.defaultModel,
    });

    // --- Set context once (userId + channelId) ---
    useEffect(() => {
        setContext(userId, channelId);
    }, [userId, channelId, setContext]);

    // --- Subscriptions ---
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsub1 = subscribeToProjects();
        const unsub2 = subscribeToConversations();
        const unsub3 = subscribeToAiSettings();
        return () => { unsub1(); unsub2(); unsub3(); };
    }, [userId, channelId, subscribeToProjects, subscribeToConversations, subscribeToAiSettings]);

    useEffect(() => {
        if (!userId || !channelId || !activeConversationId) return;
        return subscribeToMessages(activeConversationId);
    }, [userId, channelId, activeConversationId, subscribeToMessages]);

    // --- Send handler ---
    const sendingRef = useRef(false);
    const handleSend = useCallback(async (text: string, attachments?: ReadyAttachment[]) => {
        if (!userId || !channelId || sendingRef.current) return;
        sendingRef.current = true;
        try {
            let convId = activeConversationId;
            if (!convId) {
                const conv = await createConversation(activeProjectId);
                convId = conv.id;
            }
            sendMessage(text, attachments, convId);
            clearAll();
        } finally {
            sendingRef.current = false;
        }
    }, [userId, channelId, activeConversationId, activeProjectId, createConversation, sendMessage, clearAll]);

    return (
        <div
            className={`chat-panel fixed ${hasAudioPlayer ? 'bottom-[144px]' : 'bottom-[88px]'} right-6 z-[9999] flex flex-col bg-bg-primary border border-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden transition-[bottom] duration-200`}
            style={{ width: panelWidth, height: panelHeight, transition: isResizing ? 'none' : undefined }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Resize handles */}
            <div className="chat-resize-edge chat-resize-left" onMouseDown={handleResizeStart('left')} />
            <div className="chat-resize-edge chat-resize-top" onMouseDown={handleResizeStart('top')} />
            <div className="chat-resize-edge chat-resize-corner" onMouseDown={handleResizeStart('corner')} />

            {isDragOver && <div className="absolute inset-0 bg-card-bg border-2 border-dashed border-text-tertiary rounded-xl flex items-center justify-center z-10 text-text-secondary text-sm font-medium pointer-events-none opacity-95">Drop files here</div>}

            <ChatHeader
                view={view}
                headerTitle={headerTitle}
                totalTokens={totalTokens}
                contextPercent={contextPercent}
                activeProjectId={activeProjectId}
                editingProjectId={editingProjectId}
                onBack={handleBack}
                onSwitchToProjects={() => setView('projects')}
                onCreateNew={async () => {
                    if (!userId || !channelId) return;
                    if (view === 'projects') setIsCreatingProject(true);
                    else await createConversation(activeProjectId);
                }}
                onClose={onClose}
            />

            <ChatContextBar
                visible={view === 'chat'}
                contextPercent={contextPercent}
                contextUsed={contextUsed}
                isContextFull={isContextFull}
            />

            <ChatErrorBanner
                error={error}
                canRetry={!!(lastFailedRequest && userId && channelId)}
                onRetry={() => retryLastMessage()}
                onDismiss={clearError}
            />

            {/* Content views */}
            {editingProject && (
                <ProjectSettings
                    project={editingProject}
                    onClose={() => setEditingProjectId(null)}
                    onUpdate={userId && channelId
                        ? (id, updates) => updateProject(id, updates)
                        : undefined}
                />
            )}

            {!editingProjectId && view === 'projects' && (
                <ProjectList
                    projects={projects}
                    conversations={conversations}
                    activeProjectId={activeProjectId}
                    onSelect={(id) => setActiveProject(id)}
                    onSelectAll={() => { setActiveProject(null); setView('conversations'); }}
                    onDelete={userId && channelId ? (id) => {
                        setPendingDelete({ type: 'project', id, name: projects.find(p => p.id === id)?.name || 'this project' });
                    } : undefined}
                    onEdit={(id) => setEditingProjectId(id)}
                    isCreating={isCreatingProject}
                    onCreateDone={async (name) => {
                        setIsCreatingProject(false);
                        if (name && userId && channelId) await createProject(name);
                    }}
                />
            )}

            {view === 'conversations' && (
                <ConversationList
                    conversations={filteredConversations}
                    activeConversationId={activeConversationId}
                    onSelect={(id) => { clearAndCleanup(); setActiveConversation(id); }}
                    onRename={(id, title) => renameConversation(id, title)}
                    onDelete={userId && channelId
                        ? (id) => {
                            setPendingDelete({ type: 'conversation', id, name: conversations.find(c => c.id === id)?.title || 'this conversation' });
                        }
                        : undefined}
                    hasMore={hasMoreConversations}
                    onLoadMore={loadOlderConversations}
                />
            )}

            {view === 'chat' && (
                <>
                    {hasMoreMessages && userId && channelId && (
                        <button className="flex items-center justify-center gap-1.5 p-2 bg-transparent border-none text-text-tertiary text-xs cursor-pointer transition-colors duration-100 shrink-0 hover:text-text-primary" onClick={() => loadOlderMessages()}>
                            <ChevronUp size={14} /> Load earlier messages
                        </button>
                    )}
                    <ChatSummaryBanner
                        summary={conversations.find(c => c.id === activeConversationId)?.summary || ''}
                    />
                    <ChatListErrorBoundary>
                        <ChatMessageList messages={messages} />
                    </ChatListErrorBoundary>
                    <ChatInput
                        onSend={handleSend}
                        onStop={stopGeneration}
                        disabled={isContextFull}
                        stagedFiles={stagedFiles}
                        onAddFiles={addFiles}
                        onRemoveFile={removeFile}
                        isAnyUploading={isAnyUploading}
                    />
                </>
            )}

            {pendingDelete && (
                <ConfirmationModal
                    isOpen
                    onClose={() => setPendingDelete(null)}
                    onConfirm={() => {
                        if (!userId || !channelId) return;
                        if (pendingDelete.type === 'project') deleteProject(pendingDelete.id);
                        else deleteConversation(pendingDelete.id);
                    }}
                    title={`Delete ${pendingDelete.type === 'project' ? 'Project' : 'Conversation'}`}
                    message={<>Are you sure you want to delete <strong>{pendingDelete.name}</strong>? This cannot be undone.</>}
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                />
            )}
        </div>
    );
};
