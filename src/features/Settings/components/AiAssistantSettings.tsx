// =============================================================================
// SETTINGS: AI Assistant Settings View
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, Brain, Pencil, Check, X, Plus } from 'lucide-react';
import { ConfirmDeleteButton } from '../../../components/ui/atoms/ConfirmDeleteButton';
import { CollapsibleMarkdownSections } from '../../Knowledge/components/CollapsibleMarkdownSections';
import { linkifyVideoIds } from '../../../core/utils/linkifyVideoIds';
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor';
import { Dropdown } from '../../../components/ui/molecules/Dropdown';
import { SegmentedControl } from '../../../components/ui/molecules/SegmentedControl';
import { useVideosCatalog } from '../../../core/hooks/useVideosCatalog';
import { useKnowledgeCatalog } from '../../../core/hooks/useKnowledgeCatalog';
import type { VideoPreviewData } from '../../Video/types';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useChatStore } from '../../../core/stores/chat/chatStore';
import { MODEL_REGISTRY, RESPONSE_LANGUAGES, RESPONSE_STYLES } from '../../../core/types/chat/chat';
import type { AiAssistantSettings as AiSettings } from '../../../core/types/chat/chat';

interface AiAssistantSettingsProps {
    settings: AiSettings;
    onChange: (settings: AiSettings) => void;
    theme: {
        isDark: boolean;
        textSecondary: string;
        textPrimary?: string;
        borderColor?: string;
    };
}

export const AiAssistantSettings: React.FC<AiAssistantSettingsProps> = ({ settings, onChange, theme }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { setContext, subscribeToAiSettings, subscribeToMemories } = useChatStore();

    const userId = user?.uid;
    const channelId = currentChannel?.id;

    // Ensure settings + memories are loaded from Firestore even if ChatPanel hasn't been opened
    useEffect(() => {
        if (!userId || !channelId) return;
        setContext(userId, channelId);
        const unsub1 = subscribeToAiSettings();
        const unsub2 = subscribeToMemories();
        return () => { unsub1(); unsub2(); };
    }, [userId, channelId, setContext, subscribeToAiSettings, subscribeToMemories]);

    const videoCatalog = useVideosCatalog();
    const knowledgeCatalog = useKnowledgeCatalog();
    const videoMap = useMemo(() => {
        if (!videoCatalog.length) return undefined;
        const map = new Map<string, VideoPreviewData>();
        for (const v of videoCatalog) {
            map.set(v.videoId, v);
            if (v.youtubeVideoId && v.youtubeVideoId !== v.videoId) map.set(v.youtubeVideoId, v);
        }
        return map;
    }, [videoCatalog]);

    const kiMap = useMemo(() => {
        if (!knowledgeCatalog.length) return undefined;
        const map = new Map<string, (typeof knowledgeCatalog)[0]>();
        for (const ki of knowledgeCatalog) map.set(ki.id, ki);
        return map;
    }, [knowledgeCatalog]);

    const memories = useChatStore(s => s.memories);
    const storeCreateMemory = useChatStore(s => s.createMemory);
    const storeUpdateMemory = useChatStore(s => s.updateMemory);
    const storeDeleteMemory = useChatStore(s => s.deleteMemory);
    const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [savingMemoryId, setSavingMemoryId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newMemoryTitle, setNewMemoryTitle] = useState('');
    const [newMemoryText, setNewMemoryText] = useState('');

    const handleEditStart = useCallback((mem: { id: string; content: string; conversationTitle: string }) => {
        setEditingMemoryId(mem.id);
        setEditText(mem.content);
        setEditTitle(mem.conversationTitle);
    }, []);

    const handleEditSave = useCallback(async (memoryId: string, originalTitle: string) => {
        if (!editText.trim()) return;
        const trimmedTitle = editTitle.trim() || 'Untitled';
        const titleChanged = trimmedTitle !== originalTitle;
        setSavingMemoryId(memoryId);
        try {
            await storeUpdateMemory(memoryId, editText.trim(), titleChanged ? trimmedTitle : undefined);
            setEditingMemoryId(null);
        } finally {
            setSavingMemoryId(null);
        }
    }, [editText, editTitle, storeUpdateMemory]);

    const handleCreateSave = useCallback(async () => {
        if (!newMemoryText.trim()) return;
        setIsCreating(false);
        try {
            await storeCreateMemory(newMemoryText.trim(), newMemoryTitle.trim() || undefined);
            setNewMemoryText('');
            setNewMemoryTitle('');
        } catch (err) {
            console.error('[AiAssistantSettings] Failed to create memory:', err);
            setIsCreating(true); // re-open textarea so user can retry
        }
    }, [newMemoryText, newMemoryTitle, storeCreateMemory]);

    const handleDelete = useCallback(async (memoryId: string) => {
        setSavingMemoryId(memoryId);
        try {
            await storeDeleteMemory(memoryId);
        } finally {
            setSavingMemoryId(null);
        }
    }, [storeDeleteMemory]);

    const [modelAnchorEl, setModelAnchorEl] = useState<HTMLElement | null>(null);
    const [langAnchorEl, setLangAnchorEl] = useState<HTMLElement | null>(null);

    const update = (patch: Partial<AiSettings>) => onChange({ ...settings, ...patch });

    // Styles using CSS variables (matches other settings views)
    const inputBg = 'bg-[var(--settings-input-bg)]';
    const inputBorder = 'border-border';
    const dropdownBg = 'bg-[var(--settings-dropdown-bg)]';
    const dropdownHover = 'hover:bg-[var(--settings-dropdown-hover)]';


    const selectedModel = MODEL_REGISTRY.find(m => m.id === settings.defaultModel);
    const selectedLang = RESPONSE_LANGUAGES.find(l => l.id === settings.responseLanguage);

    return (
        <div className="space-y-8 animate-fade-in max-w-[600px]">
            <section className="space-y-1">
                <h3 className="text-base font-medium">AI Assistant</h3>
                <p className={`text-sm ${theme.textSecondary}`}>
                    Customize how the AI assistant works. The API key is managed server-side.
                </p>
            </section>

            {/* Default Model */}
            <div className={`border ${theme.borderColor} rounded-md p-4 space-y-3`}>
                <label className={`block text-xs ${theme.textSecondary} mb-1`}>Default Model</label>
                <div className="relative w-64">
                    <button
                        onClick={(e) => setModelAnchorEl(prev => prev ? null : e.currentTarget)}
                        className={`w-full flex items-center justify-between ${inputBg} border ${inputBorder} ${modelAnchorEl ? 'rounded-t-md rounded-b-none border-b-transparent' : 'rounded-md'} px-3 py-2 hover:border-gray-400 transition-colors`}
                    >
                        <span className="text-sm">{selectedModel?.label || settings.defaultModel}</span>
                        <ChevronDown
                            size={16}
                            className={`${theme.textSecondary} transition-transform ${modelAnchorEl ? 'rotate-180' : ''}`}
                        />
                    </button>

                    <Dropdown
                        isOpen={Boolean(modelAnchorEl)}
                        anchorEl={modelAnchorEl}
                        onClose={() => setModelAnchorEl(null)}
                        width={256}
                        className={`${dropdownBg}`}
                        zIndexClass="z-tooltip"
                        connected
                    >
                        {MODEL_REGISTRY.map((m) => (
                            <div
                                key={m.id}
                                className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors ${m.id === settings.defaultModel ? 'opacity-100 font-medium' : 'opacity-70'}`}
                                onClick={() => {
                                    update({ defaultModel: m.id });
                                    setModelAnchorEl(null);
                                }}
                            >
                                {m.label}
                            </div>
                        ))}
                    </Dropdown>
                </div>
                <p className={`text-xs ${theme.textSecondary}`}>
                    You can override this for individual projects in the chat panel.
                </p>
            </div>

            {/* Response Language */}
            <div className={`border ${theme.borderColor} rounded-md p-4 space-y-3`}>
                <label className={`block text-xs ${theme.textSecondary} mb-1`}>Response Language</label>
                <div className="relative w-64">
                    <button
                        onClick={(e) => setLangAnchorEl(prev => prev ? null : e.currentTarget)}
                        className={`w-full flex items-center justify-between ${inputBg} border ${inputBorder} ${langAnchorEl ? 'rounded-t-md rounded-b-none border-b-transparent' : 'rounded-md'} px-3 py-2 hover:border-gray-400 transition-colors`}
                    >
                        <span className="text-sm">{selectedLang?.label || settings.responseLanguage}</span>
                        <ChevronDown
                            size={16}
                            className={`${theme.textSecondary} transition-transform ${langAnchorEl ? 'rotate-180' : ''}`}
                        />
                    </button>

                    <Dropdown
                        isOpen={Boolean(langAnchorEl)}
                        anchorEl={langAnchorEl}
                        onClose={() => setLangAnchorEl(null)}
                        width={256}
                        className={`${dropdownBg}`}
                        zIndexClass="z-tooltip"
                        connected
                    >
                        {RESPONSE_LANGUAGES.map((l) => (
                            <div
                                key={l.id}
                                className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors ${l.id === settings.responseLanguage ? 'opacity-100 font-medium' : 'opacity-70'}`}
                                onClick={() => {
                                    update({ responseLanguage: l.id });
                                    setLangAnchorEl(null);
                                }}
                            >
                                {l.label}
                            </div>
                        ))}
                    </Dropdown>
                </div>
                <p className={`text-xs ${theme.textSecondary}`}>
                    Auto matches the language of your message.
                </p>
            </div>

            {/* Response Style */}
            <div className={`border ${theme.borderColor} rounded-md p-4 space-y-3`}>
                <label className={`block text-xs ${theme.textSecondary} mb-1`}>Response Style</label>
                <SegmentedControl
                    options={RESPONSE_STYLES.map(s => ({ value: s.id, label: s.label }))}
                    value={settings.responseStyle}
                    onChange={(v) => update({ responseStyle: v })}
                    className="w-72"
                />
                <p className={`text-xs ${theme.textSecondary}`}>
                    {RESPONSE_STYLES.find(s => s.id === settings.responseStyle)?.description}
                </p>
            </div>

            {/* Global System Prompt */}
            <div className={`border ${theme.borderColor} rounded-md p-4 space-y-3`}>
                <label className="block text-xs text-text-secondary font-medium tracking-wider uppercase mb-2">
                    Base Instructions
                </label>
                <RichTextEditor
                    value={settings.globalSystemPrompt}
                    onChange={(v) => update({ globalSystemPrompt: v })}
                    placeholder="e.g. You are a helpful assistant for YouTube content creation."
                    defaultCollapsedLevel={1}
                />
                <p className={`text-xs ${theme.textSecondary}`}>
                    Sent with every message. Project-specific instructions are added after these.
                </p>
            </div>

            {/* AI Memory (Layer 4) */}
            <div className={`border ${theme.borderColor} rounded-md p-4 space-y-3`}>
                <div className="flex items-center gap-2 mb-1">
                    <Brain size={16} className="text-accent" />
                    <label className={`text-xs ${theme.textSecondary} uppercase tracking-wider font-medium`}>AI Memory</label>
                    <span className={`text-[10px] ${theme.textSecondary} ml-auto`}>
                        {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
                    </span>
                    <button
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-transparent border-none cursor-pointer hover:bg-white/[0.05] transition-colors"
                        style={{ color: 'var(--accent)' }}
                        onClick={() => { setIsCreating(true); setNewMemoryTitle(''); setNewMemoryText(''); }}
                    >
                        <Plus size={12} /> Add Memory
                    </button>
                </div>

                {isCreating && (
                    <div
                        className="rounded-lg p-3"
                        style={{ backgroundColor: 'var(--settings-menu-active)' }}
                    >
                        <input
                            type="text"
                            value={newMemoryTitle}
                            onChange={(e) => setNewMemoryTitle(e.target.value)}
                            placeholder="Title (optional)"
                            className="w-full bg-transparent text-sm font-medium text-text-primary outline-none border border-border rounded-md px-2 py-1.5 mb-2 placeholder-modal-placeholder"
                            autoFocus
                        />
                        <div className="max-h-[400px] overflow-y-auto">
                            <RichTextEditor
                                value={newMemoryText}
                                onChange={setNewMemoryText}
                                placeholder="Write your memory..."
                                videoCatalog={videoCatalog}
                                knowledgeCatalog={knowledgeCatalog}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-2">
                            <button
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
                                onClick={() => setIsCreating(false)}
                            >
                                <X size={12} /> Cancel
                            </button>
                            <button
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-transparent border-none cursor-pointer hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                                style={{ color: 'var(--accent)' }}
                                onClick={handleCreateSave}
                                disabled={!newMemoryText.trim()}
                            >
                                <Check size={12} /> Save
                            </button>
                        </div>
                    </div>
                )}

                {memories.length === 0 && !isCreating ? (
                    <p className={`text-sm ${theme.textSecondary} italic inline-flex items-center gap-1`}>
                        No memories yet. Use the <Brain size={14} className="inline" /> button in chat to memorize conversations.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {memories.map(mem => {
                            const isEditing = editingMemoryId === mem.id;
                            const isSaving = savingMemoryId === mem.id;
                            const date = mem.createdAt?.toDate?.()
                                ? mem.createdAt.toDate().toISOString().slice(0, 10)
                                : '';

                            return (
                                <div
                                    key={mem.id}
                                    className="rounded-lg p-3"
                                    style={{ backgroundColor: 'var(--settings-menu-active)' }}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    placeholder="Memory title"
                                                    className="flex-1 min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none border-b border-border px-0 py-0.5 placeholder-modal-placeholder focus:border-accent transition-colors"
                                                />
                                            ) : (
                                                <span className="text-sm font-medium text-text-primary truncate">
                                                    {mem.conversationTitle}
                                                </span>
                                            )}
                                            <span className={`text-[10px] ${theme.textSecondary} shrink-0`}>
                                                {date}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0 ml-2">
                                            <button
                                                className={`p-1.5 rounded-md transition-colors ${isEditing ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/[0.05]'}`}
                                                onClick={() => isEditing ? setEditingMemoryId(null) : handleEditStart(mem)}
                                                disabled={isSaving}
                                                title={isEditing ? 'Cancel editing' : 'Edit'}
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <ConfirmDeleteButton
                                                onConfirm={() => handleDelete(mem.id)}
                                                size={12}
                                                title="Delete memory"
                                            />
                                        </div>
                                    </div>

                                    {isEditing ? (
                                        <>
                                            <div className="max-h-[400px] overflow-y-auto">
                                                <RichTextEditor
                                                    value={editText}
                                                    onChange={setEditText}
                                                    placeholder="Write your memory..."
                                                    videoCatalog={videoCatalog}
                                knowledgeCatalog={knowledgeCatalog}
                                                />
                                            </div>
                                            <div className="flex items-center justify-end gap-1.5 mt-2">
                                                <button
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
                                                    onClick={() => setEditingMemoryId(null)}
                                                    disabled={isSaving}
                                                >
                                                    <X size={12} /> Cancel
                                                </button>
                                                <button
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-transparent border-none cursor-pointer hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                                                    style={{ color: 'var(--accent)' }}
                                                    onClick={() => handleEditSave(mem.id, mem.conversationTitle)}
                                                    disabled={isSaving}
                                                >
                                                    <Check size={12} /> Save
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="max-h-[300px] overflow-y-auto">
                                                <CollapsibleMarkdownSections
                                                    content={videoMap ? linkifyVideoIds(mem.content, videoMap) : mem.content}
                                                    videoMap={videoMap}
                                                    kiMap={kiMap}
                                                    defaultOpenLevel={0}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <p className={`text-xs ${theme.textSecondary}`}>
                    Memories are injected into every conversation so the AI retains knowledge over time.
                </p>
            </div>

        </div>
    );
};
