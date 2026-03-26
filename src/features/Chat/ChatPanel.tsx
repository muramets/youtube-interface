// =============================================================================
// AI CHAT: Main Chat Panel — Orchestrator
// =============================================================================

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { useChatStore } from '../../core/stores/chat/chatStore';
import { useShallow } from 'zustand/react/shallow';
import { useFileAttachments } from './hooks/useFileAttachments';
import { usePanelGeometry, TRANSITION_MS } from './hooks/usePanelGeometry';
import { useChatDragDrop } from './hooks/useChatDragDrop';
import { useChatDerivedState } from './hooks/useChatDerivedState';
import { useChatNavigation } from './hooks/useChatNavigation';

import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { MODEL_REGISTRY } from '../../core/types/chat/chat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { ChatHeader } from './components/ChatHeader';
import { ChatContextBar } from './components/ChatContextBar';
import { PersistedContextBar } from './components/PersistedContextBar';
import { ChatErrorBanner } from './components/ChatErrorBanner';
import { ProjectList } from './components/ProjectList';
import { ProjectSettings } from './components/ProjectSettings';
import { ConversationList } from './components/ConversationList';
import { ChatSummaryBanner } from './components/ChatSummaryBanner';
import { ChatListErrorBoundary } from './components/ChatBoundaries';
import { TokenBreakdown } from './components/TokenBreakdown';
import { CostAlertBanner } from './components/CostAlertBanner';
import { useCostAlerts } from './hooks/useCostAlerts';
import { useVideosCatalog } from '../../core/hooks/useVideosCatalog';
import { useKnowledgeCatalog } from '../../core/hooks/useKnowledgeCatalog';
import type { ReadyAttachment } from '../../core/types/chat/chatAttachment';
import { buildConversationTrace, downloadJson } from './utils/exportConversation';
import { extractMentionedVideos } from './utils/extractMentionedVideos';

export const ChatPanel: React.FC<{ onClose?: () => void; anchorBottomPx?: number; anchorRightPx?: number }> = ({ onClose, anchorBottomPx = 32, anchorRightPx = 32 }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid ?? null;
    const channelId = currentChannel?.id ?? null;
    const isCanvasOpen = useCanvasStore((s) => s.isOpen);

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
    const startNewChat = useChatStore(s => s.startNewChat);
    const pendingConversationId = useChatStore(s => s.pendingConversationId);
    const deleteConversation = useChatStore(s => s.deleteConversation);
    const renameConversation = useChatStore(s => s.renameConversation);
    const sendMessage = useChatStore(s => s.sendMessage);
    const clearError = useChatStore(s => s.clearError);
    const subscribeToProjects = useChatStore(s => s.subscribeToProjects);
    const subscribeToConversations = useChatStore(s => s.subscribeToConversations);
    const subscribeToMessages = useChatStore(s => s.subscribeToMessages);
    const subscribeToAiSettings = useChatStore(s => s.subscribeToAiSettings);
    const subscribeToMemories = useChatStore(s => s.subscribeToMemories);
    const loadOlderMessages = useChatStore(s => s.loadOlderMessages);
    const loadOlderConversations = useChatStore(s => s.loadOlderConversations);
    const retryLastMessage = useChatStore(s => s.retryLastMessage);
    const stopGeneration = useChatStore(s => s.stopGeneration);
    const setConversationModel = useChatStore(s => s.setConversationModel);
    const setConversationThinkingOptionId = useChatStore(s => s.setConversationThinkingOptionId);
    const setPendingModel = useChatStore(s => s.setPendingModel);
    const pendingModel = useChatStore(s => s.pendingModel);
    const editingMessage = useChatStore(s => s.editingMessage);
    const setEditingMessage = useChatStore(s => s.setEditingMessage);
    const editMessage = useChatStore(s => s.editMessage);

    // --- Custom hooks ---
    const conversationIdForUpload = activeConversationId ?? pendingConversationId ?? undefined;
    const { panelRect, isInteracting, isMaximized, isTransitioning, dragTransform, handleDragStart, handleResizeStart, toggleMaximize } = usePanelGeometry(anchorBottomPx, anchorRightPx);

    // Compute provider early (before useChatDerivedState) to break circular hook dependency:
    // useChatDerivedState needs editingProject → useChatNavigation needs clearAndCleanup → useFileAttachments needs provider
    const activeModelProvider = useMemo(() => {
        const activeConv = conversations.find(c => c.id === activeConversationId);
        const modelId = pendingModel || activeConv?.model;
        return modelId ? MODEL_REGISTRY.find(m => m.id === modelId)?.provider : undefined;
    }, [pendingModel, conversations, activeConversationId]);
    const { stagedFiles, addFiles, removeFile, clearAll, clearAndCleanup, isAnyUploading } = useFileAttachments(userId ?? undefined, channelId ?? undefined, conversationIdForUpload, activeModelProvider);
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
        filteredConversations, activeConversation, headerTitle,
        totalTokens, totalCost, totalSavings, activeModel, modelLabel, contextUsed, contextPercent, contextLimit, modelContextLimit, isContextFull,
    } = useChatDerivedState({
        projects, conversations, messages,
        view, activeProjectId, activeConversationId, editingProject,
        defaultModel: aiSettings.defaultModel,
        pendingModel,
    });

    // --- Token breakdown panel ---
    const [showBreakdown, setShowBreakdown] = useState(false);
    const lastBreakdown = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === 'model' && msg.contextBreakdown) {
                return { contextBreakdown: msg.contextBreakdown, normalizedUsage: msg.normalizedUsage };
            }
        }
        return null;
    }, [messages]);

    // --- Cost alerts ---
    const costAlert = useCostAlerts(messages, activeModel);

    // --- Mention catalogs (for @-mentions in chat input) ---
    const videoCatalog = useVideosCatalog();
    const knowledgeCatalog = useKnowledgeCatalog();

    // --- Set context once (userId + channelId) ---

    const activePersistedContext = useMemo(() => {
        if (view !== 'chat' || !activeConversationId) return [];
        return conversations.find(c => c.id === activeConversationId)?.persistedContext ?? [];
    }, [view, activeConversationId, conversations]);

    useEffect(() => {
        setContext(userId, channelId);
    }, [userId, channelId, setContext]);

    // --- Subscriptions ---
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsub1 = subscribeToProjects();
        const unsub2 = subscribeToConversations();
        const unsub3 = subscribeToAiSettings();
        const unsub4 = subscribeToMemories();
        return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
    }, [userId, channelId, subscribeToProjects, subscribeToConversations, subscribeToAiSettings, subscribeToMemories]);

    useEffect(() => {
        if (!userId || !channelId || !activeConversationId) return;
        return subscribeToMessages(activeConversationId);
    }, [userId, channelId, activeConversationId, subscribeToMessages]);

    // --- Export handler ---
    const handleExportConversation = useCallback(async (convId: string) => {
        if (!userId || !channelId) return;
        const conv = conversations.find(c => c.id === convId);
        if (!conv) return;
        const trace = await buildConversationTrace(userId, channelId, conv);
        const slug = conv.title.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40).toLowerCase();
        downloadJson(trace, `trace-${slug}-${convId.slice(0, 8)}.json`);
    }, [userId, channelId, conversations]);

    // --- Send handler ---
    const sendingRef = useRef(false);
    const handleSend = useCallback(async (text: string, attachments?: ReadyAttachment[]) => {
        if (!userId || !channelId || sendingRef.current) return;
        sendingRef.current = true;
        try {
            const mentioned = extractMentionedVideos(text, videoCatalog);
            const options = mentioned.length ? { mentionedVideos: mentioned } : undefined;
            sendMessage(text, attachments, undefined, undefined, options);
            clearAll();
        } finally {
            sendingRef.current = false;
        }
    }, [userId, channelId, sendMessage, clearAll, videoCatalog]);

    return (
        <>
            {/* Invisible overlay during interaction — blocks hover on elements below */}
            {
                isInteracting && (
                    <div className="fixed inset-0 z-fab" />
                )
            }
            <div
                className="chat-panel fixed flex flex-col bg-card-bg rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden"
                style={{
                    top: panelRect.top,
                    left: panelRect.left,
                    width: panelRect.width,
                    height: panelRect.height,
                    transform: dragTransform ? `translate(${dragTransform.x}px, ${dragTransform.y}px)` : undefined,
                    transition: isInteracting ? 'none' : isTransitioning ? `top ${TRANSITION_MS}ms ease, left ${TRANSITION_MS}ms ease, width ${TRANSITION_MS}ms ease, height ${TRANSITION_MS}ms ease` : undefined,
                    willChange: isInteracting || isTransitioning ? 'transform, width, height, top, left' : undefined,
                    zIndex: isCanvasOpen ? 401 : 400, // z-panel-elevated : z-panel (inline — conditional value)
                }}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Resize handles — all 4 edges + 4 corners */}
                {panelRect.canResizeLeft && <div className="chat-resize-edge chat-resize-left" onMouseDown={handleResizeStart('left')} />}
                {panelRect.canResizeRight && <div className="chat-resize-edge chat-resize-right" onMouseDown={handleResizeStart('right')} />}
                {panelRect.canResizeTop && <div className="chat-resize-edge chat-resize-top" onMouseDown={handleResizeStart('top')} />}
                {panelRect.canResizeBottom && <div className="chat-resize-edge chat-resize-bottom" onMouseDown={handleResizeStart('bottom')} />}
                {panelRect.canResizeTop && panelRect.canResizeLeft && <div className="chat-resize-edge chat-resize-corner-tl" onMouseDown={handleResizeStart('top-left')} />}
                {panelRect.canResizeTop && panelRect.canResizeRight && <div className="chat-resize-edge chat-resize-corner-tr" onMouseDown={handleResizeStart('top-right')} />}
                {panelRect.canResizeBottom && panelRect.canResizeLeft && <div className="chat-resize-edge chat-resize-corner-bl" onMouseDown={handleResizeStart('bottom-left')} />}
                {panelRect.canResizeBottom && panelRect.canResizeRight && <div className="chat-resize-edge chat-resize-corner-br" onMouseDown={handleResizeStart('bottom-right')} />}

                {isDragOver && <div className="absolute inset-0 bg-card-bg border-2 border-dashed border-text-tertiary rounded-xl flex items-center justify-center z-10 text-text-secondary text-sm font-medium pointer-events-none opacity-95">Drop files here</div>}

                <ChatHeader
                    view={view}
                    headerTitle={headerTitle}
                    totalTokens={totalTokens}
                    contextUsed={contextUsed}
                    totalCost={totalCost}
                    totalSavings={totalSavings}
                    contextPercent={contextPercent}
                    contextLimit={contextLimit}
                    modelContextLimit={modelContextLimit}
                    activeProjectId={activeProjectId}
                    editingProjectId={editingProjectId}
                    onBack={handleBack}
                    onSwitchToProjects={() => setView('projects')}
                    onCreateNew={async () => {
                        if (!userId || !channelId) return;
                        if (view === 'projects') setIsCreatingProject(true);
                        else { clearAndCleanup(); startNewChat(); }
                    }}
                    onClose={onClose ? () => { clearAndCleanup(); onClose(); } : undefined}
                    onDragStart={handleDragStart}
                    isMaximized={isMaximized}
                    onToggleMaximize={toggleMaximize}
                    onToggleBreakdown={() => setShowBreakdown(prev => !prev)}
                />

                {showBreakdown && lastBreakdown && (
                    <div className="px-3.5 py-2.5 border-b border-border bg-surface-primary">
                        <TokenBreakdown
                            contextBreakdown={lastBreakdown.contextBreakdown}
                            contextUsed={contextUsed}
                            contextLimit={contextLimit}
                            normalizedUsage={lastBreakdown.normalizedUsage}
                        />
                    </div>
                )}

                {view === 'chat' && costAlert.level !== 'none' && (
                    <CostAlertBanner
                        level={costAlert.level}
                        totalCostUsd={costAlert.totalCostUsd}
                        recommendation={costAlert.recommendation}
                    />
                )}

                <ChatContextBar
                    visible={view === 'chat'}
                    contextPercent={contextPercent}
                    contextUsed={contextUsed}
                    isContextFull={isContextFull}
                />

                {activePersistedContext.length > 0 && activeConversationId && (
                    <PersistedContextBar
                        items={activePersistedContext}
                    />
                )}

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
                        onExport={userId && channelId ? handleExportConversation : undefined}
                        onDelete={userId && channelId
                            ? (id) => deleteConversation(id)
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
                        <div className="flex-1 min-h-0 flex flex-col">
                            <ChatListErrorBoundary>
                                <ChatMessageList messages={messages} />
                            </ChatListErrorBoundary>
                        </div>
                        <ChatInput
                            onSend={handleSend}
                            onStop={stopGeneration}
                            disabled={isContextFull}
                            stagedFiles={stagedFiles}
                            onAddFiles={addFiles}
                            onRemoveFile={removeFile}
                            isAnyUploading={isAnyUploading}
                            modelLabel={modelLabel}
                            activeModel={activeModel}
                            onModelChange={(modelId) => {
                                if (activeConversationId) setConversationModel(activeConversationId, modelId);
                                else setPendingModel(modelId);
                            }}
                            conversationThinkingOptionId={activeConversation?.thinkingOptionId}
                            onThinkingChange={(optionId) => {
                                if (activeConversationId) setConversationThinkingOptionId(activeConversationId, optionId);
                            }}
                            editingMessage={editingMessage}
                            onCancelEdit={() => setEditingMessage(null)}
                            onEditSend={(newText, attachments) => {
                                const mentioned = extractMentionedVideos(newText, videoCatalog);
                                editMessage(newText, attachments, mentioned.length ? { mentionedVideos: mentioned } : undefined);
                            }}
                            videoCatalog={videoCatalog}
                            knowledgeCatalog={knowledgeCatalog}
                        />
                    </>
                )}

                {pendingDelete && (
                    <ConfirmationModal
                        isOpen
                        onClose={() => setPendingDelete(null)}
                        onConfirm={() => {
                            if (!userId || !channelId) return;
                            deleteProject(pendingDelete.id);
                        }}
                        title="Delete Project"
                        message={<>Are you sure you want to delete <strong>{pendingDelete.name}</strong>? This cannot be undone.</>}
                        confirmLabel="Delete"
                        cancelLabel="Cancel"
                    />
                )}
            </div>
        </>
    );
};
