// =============================================================================
// SETTINGS: AI Assistant Settings View
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Brain, Pencil, Trash2, Check, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dropdown } from '../../components/ui/molecules/Dropdown';
import { SegmentedControl } from '../../components/ui/molecules/SegmentedControl';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useChatStore } from '../../core/stores/chatStore';
import { MODEL_REGISTRY, RESPONSE_LANGUAGES, RESPONSE_STYLES } from '../../core/types/chat';
import type { AiAssistantSettings as AiSettings } from '../../core/types/chat';

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

    const memories = useChatStore(s => s.memories);
    const storeUpdateMemory = useChatStore(s => s.updateMemory);
    const storeDeleteMemory = useChatStore(s => s.deleteMemory);
    const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [savingMemoryId, setSavingMemoryId] = useState<string | null>(null);

    const handleEditStart = useCallback((mem: { id: string; content: string }) => {
        setEditingMemoryId(mem.id);
        setEditText(mem.content);
    }, []);

    const handleEditSave = useCallback(async (memoryId: string) => {
        if (!editText.trim()) return;
        setSavingMemoryId(memoryId);
        try {
            await storeUpdateMemory(memoryId, editText.trim());
            setEditingMemoryId(null);
        } finally {
            setSavingMemoryId(null);
        }
    }, [editText, storeUpdateMemory]);

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
                <div
                    className="relative flex flex-col bg-bg-secondary border border-border rounded-lg p-3 hover:border-text-primary focus-within:border-text-primary transition-colors"
                    style={{ height: '180px' }}
                >
                    <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-2">
                        Base Instructions
                    </label>
                    <textarea
                        value={settings.globalSystemPrompt}
                        onChange={(e) => update({ globalSystemPrompt: e.target.value })}
                        placeholder="e.g. You are a helpful assistant for YouTube content creation."
                        className="flex-1 w-full bg-transparent text-sm text-text-primary outline-none resize-none placeholder-modal-placeholder"
                    />
                </div>
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
                </div>

                {memories.length === 0 ? (
                    <p className={`text-sm ${theme.textSecondary} italic`}>
                        No memories yet. Use the 🧠 button in chat to memorize conversations.
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
                                        <span className="text-sm font-medium text-text-primary truncate">
                                            {mem.conversationTitle}
                                        </span>
                                        <span className={`text-[10px] ${theme.textSecondary} ml-2 shrink-0`}>
                                            {date}
                                        </span>
                                    </div>

                                    {isEditing ? (
                                        <>
                                            <textarea
                                                ref={(el) => {
                                                    if (el) {
                                                        el.style.height = 'auto';
                                                        el.style.height = el.scrollHeight + 'px';
                                                        el.focus();
                                                    }
                                                }}
                                                value={editText}
                                                onChange={(e) => {
                                                    setEditText(e.target.value);
                                                    e.target.style.height = 'auto';
                                                    e.target.style.height = e.target.scrollHeight + 'px';
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        e.stopPropagation();
                                                        setEditingMemoryId(null);
                                                    }
                                                }}
                                                className="w-full bg-transparent text-sm text-text-primary outline-none resize-none border border-border rounded-md p-2 max-h-[300px] overflow-y-auto"
                                                disabled={isSaving}
                                            />
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
                                                    onClick={() => handleEditSave(mem.id)}
                                                    disabled={isSaving}
                                                >
                                                    <Check size={12} /> Save
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="prose prose-sm prose-invert max-w-none text-text-secondary max-h-[300px] overflow-y-auto
                                                [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-0 [&_h1]:mb-2
                                                [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1.5
                                                [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-2 [&_h3]:mb-1
                                                [&_p]:text-sm [&_p]:leading-relaxed [&_p]:my-1.5
                                                [&_ul]:text-sm [&_ul]:my-1.5 [&_ul]:pl-4
                                                [&_ol]:text-sm [&_ol]:my-1.5 [&_ol]:pl-4
                                                [&_li]:my-0.5
                                                [&_strong]:text-text-primary [&_strong]:font-semibold
                                                [&_a]:underline
                                            ">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {mem.content}
                                                </ReactMarkdown>
                                            </div>
                                            <div className="flex items-center justify-end gap-1 mt-2">
                                                <button
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
                                                    onClick={() => handleEditStart(mem)}
                                                    disabled={isSaving}
                                                >
                                                    <Pencil size={11} /> Edit
                                                </button>
                                                <button
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-tertiary bg-transparent border-none cursor-pointer hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                    onClick={() => handleDelete(mem.id)}
                                                    disabled={isSaving}
                                                >
                                                    <Trash2 size={11} /> Delete
                                                </button>
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
