import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../../components/ui/atoms/Button/Button';
import { MODEL_REGISTRY } from '../../../core/types/chat';

interface ProjectSettingsProps {
    project: { id: string; name: string; systemPrompt?: string; model?: string };
    onClose: () => void;
    onUpdate?: (id: string, updates: Partial<{ name: string; systemPrompt: string; model: string }>) => void;
}

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({ project, onClose, onUpdate }) => {
    const [name, setName] = useState(project.name);
    const [prompt, setPrompt] = useState(project.systemPrompt || '');
    const [model, setModel] = useState(project.model || '');
    const [isModelOpen, setIsModelOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isDirty = useMemo(() => {
        if (name !== project.name) return true;
        if (prompt !== (project.systemPrompt || '')) return true;
        if (model !== (project.model || '')) return true;
        return false;
    }, [name, prompt, model, project.name, project.systemPrompt, project.model]);

    // Click outside to close dropdown
    useEffect(() => {
        if (!isModelOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsModelOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isModelOpen]);

    const selectedLabel = model
        ? MODEL_REGISTRY.find(m => m.id === model)?.label || model
        : 'Use global default';

    const inputClass = "py-[7px] px-2.5 rounded-md border border-border bg-input-bg text-text-primary text-[13px] font-[inherit] outline-none transition-colors duration-100 focus:border-text-tertiary";

    return (
        <div className="flex flex-col overflow-y-auto flex-1">
            <div className="p-3.5 flex flex-col gap-3 flex-1 overflow-visible">
                <label className="flex flex-col gap-[5px] text-xs text-text-secondary">
                    Project Name
                    <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="My project" />
                </label>
                <div className="flex flex-col gap-[5px] relative" ref={dropdownRef}>
                    <span className="text-xs text-text-secondary">AI Model</span>
                    <button
                        className={`flex items-center justify-between w-full py-[7px] px-2.5 rounded-md border border-border bg-input-bg text-text-primary text-[13px] font-[inherit] cursor-pointer transition-colors duration-100 hover:border-text-tertiary ${isModelOpen ? 'rounded-b-none border-b-border' : ''}`}
                        onClick={() => setIsModelOpen(prev => !prev)}
                    >
                        <span>{selectedLabel}</span>
                        <ChevronDown size={14} className={`text-text-tertiary shrink-0 transition-transform duration-150 ${isModelOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isModelOpen && (
                        <div className="absolute top-full left-0 right-0 z-dropdown bg-card-bg border border-border border-t-0 rounded-b-md shadow-[0_8px_24px_rgba(0,0,0,0.3)] overflow-hidden">
                            <div
                                className={`py-2 px-3 text-[13px] cursor-pointer text-text-secondary transition-colors duration-100 hover:bg-hover-bg hover:text-text-primary ${!model ? 'text-text-primary font-medium' : ''}`}
                                onClick={() => { setModel(''); setIsModelOpen(false); }}
                            >
                                Use global default
                            </div>
                            {MODEL_REGISTRY.map((m) => (
                                <div
                                    key={m.id}
                                    className={`py-2 px-3 text-[13px] cursor-pointer text-text-secondary transition-colors duration-100 hover:bg-hover-bg hover:text-text-primary ${m.id === model ? 'text-text-primary font-medium' : ''}`}
                                    onClick={() => { setModel(m.id); setIsModelOpen(false); }}
                                >
                                    {m.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <label className="flex flex-col gap-[5px] text-xs text-text-secondary">
                    Instructions for AI
                    <textarea className={`${inputClass} resize-y min-h-[60px]`} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Extra instructions specific to this project..." />
                </label>
            </div>
            <div className="flex gap-2 justify-end px-3.5 pb-3.5 pt-2.5 border-t border-border shrink-0">
                <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button variant="primary" size="sm" disabled={!isDirty} onClick={() => {
                    onUpdate?.(project.id, { name, systemPrompt: prompt, model: model || undefined });
                    onClose();
                }}>Save</Button>
            </div>
        </div>
    );
};
