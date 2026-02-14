// =============================================================================
// SETTINGS: AI Assistant Settings View
// =============================================================================

import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dropdown } from '../../components/ui/molecules/Dropdown';
import { SegmentedControl } from '../../components/ui/molecules/SegmentedControl';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useChatStore } from '../../core/stores/chatStore';
import { MODEL_REGISTRY, RESPONSE_LANGUAGES, RESPONSE_STYLES } from '../../core/types/chat';

interface AiAssistantSettingsProps {
    theme: {
        isDark: boolean;
        textSecondary: string;
        textPrimary?: string;
        borderColor?: string;
    };
}

export const AiAssistantSettings: React.FC<AiAssistantSettingsProps> = ({ theme }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { aiSettings, saveAiSettings, setContext, subscribeToAiSettings } = useChatStore();

    const userId = user?.uid;
    const channelId = currentChannel?.id;

    // Ensure settings are loaded from Firestore even if ChatPanel hasn't been opened
    useEffect(() => {
        if (!userId || !channelId) return;
        setContext(userId, channelId);
        return subscribeToAiSettings();
    }, [userId, channelId, setContext, subscribeToAiSettings]);

    const [defaultModel, setDefaultModel] = useState(aiSettings.defaultModel);
    const [globalPrompt, setGlobalPrompt] = useState(aiSettings.globalSystemPrompt);
    const [responseLanguage, setResponseLanguage] = useState(aiSettings.responseLanguage);
    const [responseStyle, setResponseStyle] = useState(aiSettings.responseStyle);
    const [saved, setSaved] = useState(false);
    const [modelAnchorEl, setModelAnchorEl] = useState<HTMLElement | null>(null);
    const [langAnchorEl, setLangAnchorEl] = useState<HTMLElement | null>(null);

    // Sync from store when settings load
    useEffect(() => {
        setDefaultModel(aiSettings.defaultModel);
        setGlobalPrompt(aiSettings.globalSystemPrompt);
        setResponseLanguage(aiSettings.responseLanguage);
        setResponseStyle(aiSettings.responseStyle);
    }, [aiSettings]);

    const handleSave = async () => {
        if (!userId || !channelId) return;
        await saveAiSettings({
            defaultModel,
            globalSystemPrompt: globalPrompt,
            responseLanguage,
            responseStyle,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    // Styles using CSS variables (matches other settings views)
    const inputBg = 'bg-[var(--settings-input-bg)]';
    const inputBorder = 'border-border';
    const dropdownBg = 'bg-[var(--settings-dropdown-bg)]';
    const dropdownHover = 'hover:bg-[var(--settings-dropdown-hover)]';


    const selectedModel = MODEL_REGISTRY.find(m => m.id === defaultModel);
    const selectedLang = RESPONSE_LANGUAGES.find(l => l.id === responseLanguage);

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
                        <span className="text-sm">{selectedModel?.label || defaultModel}</span>
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
                        zIndexClass="z-[10000]"
                        connected
                    >
                        {MODEL_REGISTRY.map((m) => (
                            <div
                                key={m.id}
                                className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors ${m.id === defaultModel ? 'opacity-100 font-medium' : 'opacity-70'}`}
                                onClick={() => {
                                    setDefaultModel(m.id);
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
                        <span className="text-sm">{selectedLang?.label || responseLanguage}</span>
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
                        zIndexClass="z-[10000]"
                        connected
                    >
                        {RESPONSE_LANGUAGES.map((l) => (
                            <div
                                key={l.id}
                                className={`px-4 py-2.5 text-sm cursor-pointer ${dropdownHover} transition-colors ${l.id === responseLanguage ? 'opacity-100 font-medium' : 'opacity-70'}`}
                                onClick={() => {
                                    setResponseLanguage(l.id);
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
                    value={responseStyle}
                    onChange={setResponseStyle}
                    className="w-72"
                />
                <p className={`text-xs ${theme.textSecondary}`}>
                    {RESPONSE_STYLES.find(s => s.id === responseStyle)?.description}
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
                        value={globalPrompt}
                        onChange={(e) => setGlobalPrompt(e.target.value)}
                        placeholder="e.g. You are a helpful assistant for YouTube content creation."
                        className="flex-1 w-full bg-transparent text-sm text-text-primary outline-none resize-none placeholder-modal-placeholder"
                    />
                </div>
                <p className={`text-xs ${theme.textSecondary}`}>
                    Sent with every message. Project-specific instructions are added after these.
                </p>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                        background: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                    }}
                >
                    Save
                </button>
                {saved && (
                    <span className="text-sm text-green-400 animate-pulse">Saved ✓</span>
                )}
            </div>
        </div>
    );
};
