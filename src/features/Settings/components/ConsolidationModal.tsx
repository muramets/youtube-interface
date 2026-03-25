// =============================================================================
// ConsolidationModal — Memory consolidation wizard
//
// Flow: selection → loading → preview/edit → save (or noChanges/error)
// =============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Loader2, AlertCircle, ChevronDown, Check, Pencil } from 'lucide-react';
import { Checkbox } from '../../../components/ui/atoms/Checkbox/Checkbox';
import { CollapsibleMarkdownSections } from '../../Knowledge/components/CollapsibleMarkdownSections';
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor';
import { linkifyVideoIds } from '../../../core/utils/linkifyVideoIds';
import { useVideosCatalog } from '../../../core/hooks/useVideosCatalog';
import { useKnowledgeCatalog } from '../../../core/hooks/useKnowledgeCatalog';
import type { VideoPreviewData } from '../../Video/types';
import type { KiPreviewData } from '../../../components/ui/organisms/RichTextEditor/types';
import { useChatStore } from '../../../core/stores/chat/chatStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { callConsolidation } from '../../../core/services/ai/aiProxyService';
import { ChatService } from '../../../core/services/ai/chatService';
import { MODEL_REGISTRY } from '../../../core/types/chat/chat';
import { Button } from '../../../components/ui/atoms/Button/Button';
import { Dropdown } from '../../../components/ui/molecules/Dropdown';
import { logger } from '../../../core/utils/logger';

interface ConsolidationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type ModalStep = 'selection' | 'loading' | 'preview' | 'noChanges' | 'error';

interface NewMemory {
    title: string;
    content: string;
}

export const ConsolidationModal: React.FC<ConsolidationModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { showToast } = useUIStore();
    const memories = useChatStore(s => s.memories);
    const aiSettings = useChatStore(s => s.aiSettings);

    // Catalogs for markdown rendering (vid:// links, KI links)
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

    // --- State machine ---
    const [step, setStep] = useState<ModalStep>('selection');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        const unprotected = new Set<string>();
        for (const m of memories) {
            if (!m.protected) unprotected.add(m.id);
        }
        return unprotected;
    });
    const [model, setModel] = useState(aiSettings.defaultModel);
    const [intention, setIntention] = useState('');
    const [reasoning, setReasoning] = useState('');
    const [newMemories, setNewMemories] = useState<NewMemory[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [costUsd, setCostUsd] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [frozenMemories, setFrozenMemories] = useState<Array<{ id: string; conversationTitle: string; content: string }> | null>(null);

    const unprotectedCount = useMemo(() => memories.filter(m => !m.protected).length, [memories]);
    const selectedCount = selectedIds.size;
    const selectedModel = useMemo(() => MODEL_REGISTRY.find(m => m.id === model), [model]);
    const selectedMemories = useMemo(
        () => memories.filter(m => selectedIds.has(m.id)),
        [memories, selectedIds],
    );

    // --- Selection handlers ---
    const toggleMemory = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        if (selectedCount === unprotectedCount) {
            setSelectedIds(new Set());
        } else {
            const all = new Set<string>();
            for (const m of memories) {
                if (!m.protected) all.add(m.id);
            }
            setSelectedIds(all);
        }
    }, [selectedCount, unprotectedCount, memories]);

    // --- Generate ---
    const handleGenerate = useCallback(async () => {
        setStep('loading');
        setErrorMessage('');

        const selected = memories
            .filter(m => selectedIds.has(m.id))
            .map(m => ({
                id: m.id,
                title: m.conversationTitle,
                content: m.content,
                createdAt: m.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            }));

        try {
            const result = await callConsolidation({
                model,
                memories: selected,
                intention: intention.trim() || undefined,
            });

            setCostUsd(result.costUsd ?? null);

            if (result.noChangesNeeded) {
                setReasoning(result.reasoning);
                setStep('noChanges');
            } else {
                setReasoning(result.reasoning);
                setNewMemories(result.memories);
                setStep('preview');
            }
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : 'Unknown error';
            logger.error('[ConsolidationModal] Generation failed', { error: err, component: 'ConsolidationModal' });
            // Humanize technical CF error messages
            const friendly = raw.includes('Rate limit') || raw.includes('overloaded')
                ? 'The AI service is busy. Please try again in a moment.'
                : raw.includes('context window')
                    ? raw // already user-friendly from validateContentLimits
                    : 'Something went wrong while analyzing your memories. Please try again.';
            setErrorMessage(friendly);
            setStep('error');
        }
    }, [memories, selectedIds, model, intention]);

    // --- Save (freeze snapshot → save → fade-out → close) ---
    const handleSave = useCallback(async () => {
        if (!user?.uid || !currentChannel?.id) return;
        setIsSaving(true);
        setFrozenMemories(selectedMemories);
        try {
            await ChatService.applyConsolidation(
                user.uid,
                currentChannel.id,
                Array.from(selectedIds),
                newMemories,
            );
            setIsSaving(false);
            setIsClosing(true);
            setTimeout(() => {
                showToast(`Consolidated ${selectedIds.size} memories into ${newMemories.length}`, 'success');
                onClose();
                setIsClosing(false);
                setFrozenMemories(null);
            }, 250);
        } catch (err: unknown) {
            logger.error('[ConsolidationModal] Save failed', { error: err, component: 'ConsolidationModal' });
            showToast('Failed to save consolidated memories', 'error');
            setFrozenMemories(null);
            setIsSaving(false);
        }
    }, [user, currentChannel, selectedIds, selectedMemories, newMemories, onClose, showToast]);

    // --- Edit preview memory ---
    const updateNewMemory = useCallback((index: number, field: 'title' | 'content', value: string) => {
        setNewMemories(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
    }, []);

    // --- Reset to selection ---
    const resetToSelection = useCallback(() => {
        setStep('selection');
        setErrorMessage('');
    }, []);

    if (!isOpen && !isClosing) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-modal-stacked flex items-center justify-center bg-black/50 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'} ${step === 'preview' ? 'p-3' : 'p-8'}`}
            onClick={step === 'selection' || step === 'noChanges' ? onClose : undefined}
        >
            <div
                className={`bg-bg-secondary rounded-xl shadow-2xl border border-border w-full ${step === 'preview' ? 'max-w-7xl h-full' : 'max-w-2xl'} max-h-full flex flex-col overflow-hidden ${isClosing ? 'animate-scale-out' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <h2 className="text-base font-medium text-text-primary">Consolidate Memories</h2>
                    <Button variant="ghost" size="sm" onClick={onClose} className="!p-1.5 !h-auto">
                        <X size={16} />
                    </Button>
                </div>

                {/* Content */}
                <div className={`flex-1 min-h-0 px-5 py-4 ${step === 'preview' ? 'flex flex-col' : 'overflow-y-auto'}`}>
                    {step === 'selection' && (
                        <SelectionStep
                            memories={memories}
                            selectedIds={selectedIds}
                            toggleMemory={toggleMemory}
                            toggleAll={toggleAll}
                            selectedCount={selectedCount}
                            unprotectedCount={unprotectedCount}
                            model={model}
                            setModel={setModel}
                            intention={intention}
                            setIntention={setIntention}
                            selectedModel={selectedModel}
                        />
                    )}
                    {step === 'loading' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 size={28} className="text-accent animate-spin" />
                            <p className="text-sm text-text-secondary">
                                Analyzing {selectedCount} memories with {selectedModel?.label ?? model}...
                            </p>
                        </div>
                    )}
                    {step === 'noChanges' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <p className="text-sm text-text-primary text-center max-w-md">
                                These memories don&apos;t overlap enough to consolidate. They&apos;re already well-organized.
                            </p>
                            {reasoning && (
                                <p className="text-xs text-text-tertiary text-center max-w-md mt-2 italic">{reasoning}</p>
                            )}
                        </div>
                    )}
                    {step === 'preview' && (
                        <PreviewStep
                            selectedMemories={frozenMemories ?? selectedMemories}
                            reasoning={reasoning}
                            costUsd={costUsd}
                            newMemories={newMemories}
                            updateNewMemory={updateNewMemory}
                            videoMap={videoMap}
                            kiMap={kiMap}
                            videoCatalog={videoCatalog}
                            knowledgeCatalog={knowledgeCatalog}
                        />
                    )}
                    {step === 'error' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <AlertCircle size={28} className="text-red-400" />
                            <p className="text-sm text-text-primary text-center max-w-md">
                                {errorMessage || 'Something went wrong.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
                    {step === 'selection' && (
                        <>
                            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                            <Button variant="accent" size="sm" onClick={handleGenerate} disabled={selectedCount < 2}>Generate</Button>
                        </>
                    )}
                    {step === 'loading' && (
                        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    )}
                    {step === 'noChanges' && (
                        <Button variant="accent" size="sm" onClick={onClose}>Close</Button>
                    )}
                    {step === 'preview' && (
                        <>
                            <Button variant="ghost" size="sm" onClick={resetToSelection} disabled={isSaving}>Back</Button>
                            <Button
                                variant="accent"
                                size="sm"
                                onClick={handleSave}
                                isLoading={isSaving}
                                disabled={newMemories.some(m => !m.title.trim() || !m.content.trim())}
                            >
                                Save
                            </Button>
                        </>
                    )}
                    {step === 'error' && (
                        <>
                            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
                            <Button variant="accent" size="sm" onClick={resetToSelection}>Try Again</Button>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

// =============================================================================
// Sub-components
// =============================================================================

interface SelectionStepProps {
    memories: Array<{ id: string; conversationTitle: string; content: string; protected?: boolean; createdAt: { toDate?: () => Date } }>;
    selectedIds: Set<string>;
    toggleMemory: (id: string) => void;
    toggleAll: () => void;
    selectedCount: number;
    unprotectedCount: number;
    model: string;
    setModel: (m: string) => void;
    intention: string;
    setIntention: (v: string) => void;
    selectedModel: { label: string } | undefined;
}

function SelectionStep({
    memories, selectedIds, toggleMemory, toggleAll, selectedCount, unprotectedCount,
    model, setModel, intention, setIntention, selectedModel,
}: SelectionStepProps) {
    return (
        <div className="space-y-4">
            {/* Memory list */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-secondary">
                        {selectedCount} of {memories.length} memories selected
                    </span>
                    <button
                        className="text-xs text-accent hover:underline"
                        onClick={toggleAll}
                    >
                        {selectedCount === unprotectedCount ? 'Deselect All' : 'Select All'}
                    </button>
                </div>
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                    {memories.map(mem => {
                        const isProtected = !!mem.protected;
                        const isSelected = selectedIds.has(mem.id);
                        const date = mem.createdAt?.toDate?.()?.toISOString().slice(0, 10) ?? '';
                        const preview = mem.content.split('\n').slice(0, 2).join(' ').slice(0, 120);

                        return (
                            <div
                                key={mem.id}
                                className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
                                    isProtected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-hover-bg'
                                }`}
                                onClick={() => !isProtected && toggleMemory(mem.id)}
                            >
                                {isProtected ? (
                                    <Lock size={14} className="text-text-tertiary mt-0.5 shrink-0" />
                                ) : (
                                    <Checkbox
                                        checked={isSelected}
                                        onChange={() => toggleMemory(mem.id)}
                                        className="mt-0.5 shrink-0"
                                    />
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-text-primary truncate">
                                            {mem.conversationTitle}
                                        </span>
                                        <span className="text-[10px] text-text-tertiary shrink-0">{date}</span>
                                        {isProtected && (
                                            <span className="text-[10px] text-text-tertiary">Protected</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-text-tertiary truncate">{preview}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Model picker — styled like ChatInput model dropdown */}
            <ModelPicker
                model={model}
                setModel={setModel}
                selectedModel={selectedModel}
            />

            {/* Intention */}
            <div>
                <label className="block text-xs text-text-secondary mb-1">Focus (optional)</label>
                <textarea
                    value={intention}
                    onChange={e => setIntention(e.target.value)}
                    placeholder="What should the AI focus on? E.g.: merge session summaries, keep only current decisions..."
                    className="w-full bg-[var(--settings-input-bg)] border border-border rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-text-secondary transition-colors resize-none placeholder:text-text-tertiary"
                    rows={2}
                />
            </div>
        </div>
    );
}

interface PreviewStepProps {
    selectedMemories: Array<{ id: string; conversationTitle: string; content: string }>;
    reasoning: string;
    costUsd: number | null;
    newMemories: NewMemory[];
    updateNewMemory: (index: number, field: 'title' | 'content', value: string) => void;
    videoMap: Map<string, VideoPreviewData> | undefined;
    kiMap: Map<string, KiPreviewData> | undefined;
    videoCatalog: VideoPreviewData[];
    knowledgeCatalog: KiPreviewData[];
}

function PreviewStep({
    selectedMemories, reasoning, costUsd, newMemories, updateNewMemory,
    videoMap, kiMap, videoCatalog, knowledgeCatalog,
}: PreviewStepProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    return (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Reasoning + Cost */}
            {(reasoning || costUsd !== null) && (
                <div className="flex items-start justify-between gap-3 bg-bg-primary rounded-md px-3 py-2">
                    {reasoning && (
                        <p className="text-xs text-text-tertiary italic flex-1">{reasoning}</p>
                    )}
                    {costUsd !== null && (
                        <span className="text-xs text-text-tertiary shrink-0 tabular-nums">
                            ${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}
                        </span>
                    )}
                </div>
            )}

            {/* Two-column layout (lg+) / stacked (below lg) */}
            <div className="flex flex-col lg:flex-row lg:gap-6 gap-4 flex-1 min-h-0">
                {/* Left: Removing (1/3 on lg+) */}
                <div className="lg:w-1/3 shrink-0 min-h-0 flex flex-col">
                    <h3 className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-1.5 shrink-0">
                        Removing ({selectedMemories.length})
                    </h3>
                    <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                        {selectedMemories.map(mem => (
                            <div key={mem.id} className="rounded-lg p-2 opacity-50" style={{ backgroundColor: 'var(--settings-menu-active)' }}>
                                <span className="text-sm font-medium text-text-tertiary line-through">{mem.conversationTitle}</span>
                                <div className="max-h-[200px] overflow-y-auto mt-1">
                                    <CollapsibleMarkdownSections
                                        content={videoMap ? linkifyVideoIds(mem.content, videoMap) : mem.content}
                                        videoMap={videoMap}
                                        kiMap={kiMap}
                                        defaultOpenLevel={0}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: New (2/3 on lg+) */}
                <div className="lg:w-2/3 min-w-0 min-h-0 flex flex-col">
                    <h3 className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-1.5 shrink-0">
                        New ({newMemories.length})
                    </h3>
                    <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
                        {newMemories.map((mem, i) => {
                            const isEditing = editingIndex === i;
                            return (
                                <div key={i} className="rounded-lg p-3" style={{ backgroundColor: 'var(--settings-menu-active)' }}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={mem.title}
                                                onChange={e => updateNewMemory(i, 'title', e.target.value)}
                                                className="flex-1 min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none border-b border-border px-0 py-0.5 placeholder-modal-placeholder hover:border-text-secondary focus:border-text-primary transition-colors"
                                                placeholder="Memory title"
                                            />
                                        ) : (
                                            <span className="text-sm font-medium text-text-primary truncate">{mem.title}</span>
                                        )}
                                        <button
                                            className={`p-1.5 rounded-md transition-colors shrink-0 ml-2 ${isEditing ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-primary hover:bg-hover-bg'}`}
                                            onClick={() => setEditingIndex(isEditing ? null : i)}
                                            title={isEditing ? 'Done editing' : 'Edit'}
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    </div>

                                    {isEditing ? (
                                        <div className="max-h-[400px] overflow-y-auto">
                                            <RichTextEditor
                                                value={mem.content}
                                                onChange={v => updateNewMemory(i, 'content', v)}
                                                placeholder="Write your memory..."
                                                videoCatalog={videoCatalog}
                                                knowledgeCatalog={knowledgeCatalog}
                                            />
                                        </div>
                                    ) : (
                                        <div className="max-h-[300px] overflow-y-auto">
                                            <CollapsibleMarkdownSections
                                                content={videoMap ? linkifyVideoIds(mem.content, videoMap) : mem.content}
                                                videoMap={videoMap}
                                                kiMap={kiMap}
                                                defaultOpenLevel={0}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Model Picker (grouped by provider, portal-based Dropdown) ---

const PROVIDERS = ['gemini', 'anthropic'] as const;
const PROVIDER_LABELS: Record<string, string> = { gemini: 'Gemini', anthropic: 'Claude' };

function ModelPicker({ model, setModel, selectedModel }: {
    model: string;
    setModel: (m: string) => void;
    selectedModel: { label: string } | undefined;
}) {
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    return (
        <div>
            <label className="block text-xs text-text-secondary mb-1">Model</label>
            <button
                ref={setAnchorEl}
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between bg-[var(--settings-input-bg)] border border-border rounded-md px-3 py-2 text-sm text-text-primary hover:border-text-secondary transition-colors"
            >
                <span>{selectedModel?.label ?? model}</span>
                <ChevronDown size={14} className={`text-text-tertiary transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </button>

            <Dropdown
                isOpen={open}
                anchorEl={anchorEl}
                onClose={() => setOpen(false)}
                width={anchorEl?.offsetWidth ?? 300}
                align="left"
                zIndexClass="z-tooltip"
                className="bg-card-bg"
                connected
            >
                {PROVIDERS.map(provider => {
                    const group = MODEL_REGISTRY.filter(m => m.provider === provider);
                    if (group.length === 0) return null;
                    return (
                        <React.Fragment key={provider}>
                            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary select-none pointer-events-none">
                                {PROVIDER_LABELS[provider]}
                            </div>
                            {group.map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    className={`w-full text-left px-3 py-1.5 text-[12px] bg-transparent border-none cursor-pointer flex items-center gap-2 transition-colors ${
                                        m.id === model
                                            ? 'text-text-primary bg-hover-bg'
                                            : 'text-text-secondary hover:text-text-primary hover:bg-hover-bg'
                                    }`}
                                    onClick={() => { setModel(m.id); setOpen(false); }}
                                >
                                    {m.label}
                                    {m.id === model && <Check size={12} className="ml-auto text-accent" />}
                                </button>
                            ))}
                        </React.Fragment>
                    );
                })}
            </Dropdown>

            <p className="text-[10px] text-text-tertiary mt-1">
                Consolidation is an analytical task; choose based on cost/quality trade-off.
            </p>
        </div>
    );
}
