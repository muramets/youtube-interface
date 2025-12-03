import React, { useState, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from '../Shared/Dropdown';
import type { PackagingSettings, PackagingCheckinRule } from '../../services/settingsService';

interface PackagingSettingsViewProps {
    settings: PackagingSettings;
    onChange: (settings: PackagingSettings) => void;
}

const PRESET_COLORS = [
    '#EF4444', // Red
    '#F97316', // Orange
    '#EAB308', // Yellow
    '#22C55E', // Green
    '#3B82F6', // Blue
    '#A855F7', // Purple
];

const ColorSelect: React.FC<{
    value: string;
    onChange: (value: string) => void;
}> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className="w-8 h-7 flex items-center justify-center bg-[#2A2A2A] hover:bg-[#333] rounded transition-colors border border-transparent focus:border-white/20"
            >
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: value }} />
            </button>
            <Dropdown
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                anchorEl={buttonRef.current}
                width={32}
                align="left"
                className="p-1"
            >
                <div className="flex flex-col gap-1">
                    {PRESET_COLORS.map(color => (
                        <button
                            key={color}
                            onClick={() => {
                                onChange(color);
                                setIsOpen(false);
                            }}
                            className={`w-full h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors ${value === color ? 'bg-white/5' : ''}`}
                        >
                            <div
                                className={`w-4 h-4 rounded-full transition-transform ${value === color ? 'ring-2 ring-white scale-110' : ''}`}
                                style={{ backgroundColor: color }}
                            />
                        </button>
                    ))}
                </div>
            </Dropdown>
        </>
    );
};

export const PackagingSettingsView: React.FC<PackagingSettingsViewProps> = ({ settings, onChange }) => {
    const addRule = () => {
        // Find the first color that isn't used
        const usedColors = new Set(settings.rules.map(r => r.badgeColor));
        let nextColor = PRESET_COLORS.find(c => !usedColors.has(c));

        // If all colors are used, cycle through them
        if (!nextColor) {
            const nextIndex = settings.rules.length % PRESET_COLORS.length;
            nextColor = PRESET_COLORS[nextIndex];
        }

        const newRule: PackagingCheckinRule = {
            id: crypto.randomUUID(),
            dayOffset: 1,
            badgeText: 'New Check',
            badgeColor: nextColor
        };
        onChange({
            ...settings,
            rules: [...settings.rules, newRule]
        });
    };

    const updateRule = (id: string, updates: Partial<PackagingCheckinRule>) => {
        const newRules = settings.rules.map(rule =>
            rule.id === id ? { ...rule, ...updates } : rule
        );
        onChange({ ...settings, rules: newRules });
    };

    const deleteRule = (id: string) => {
        const newRules = settings.rules.filter(rule => rule.id !== id);
        onChange({ ...settings, rules: newRules });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-lg font-medium text-white">Packaging Check-ins</h2>
                    <p className="text-sm text-[#AAAAAA]">Configure mandatory check-ins for video packaging</p>
                </div>
                {/* Header button removed */}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {settings.rules.length === 0 ? (
                    <div className="bg-[#1F1F1F] p-4 rounded-xl border border-white/5 flex items-center justify-center text-[#555] text-sm">
                        <span>No check-ins configured. <button onClick={addRule} className="text-[#AAAAAA] hover:text-white transition-colors hover:underline">Add one to get started</button></span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {settings.rules.map((rule) => (
                            <div key={rule.id} className="bg-[#1F1F1F] p-3 rounded-xl border border-white/5 flex items-start gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Days</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={rule.dayOffset}
                                        onChange={(e) => updateRule(rule.id, { dayOffset: parseInt(e.target.value) || 0 })}
                                        className="w-14 bg-[#2A2A2A] border border-transparent focus:border-white/20 rounded px-2 py-1.5 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>

                                <div className="flex flex-col gap-1 flex-1">
                                    <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Badge Text</label>
                                    <input
                                        type="text"
                                        value={rule.badgeText}
                                        onChange={(e) => updateRule(rule.id, { badgeText: e.target.value })}
                                        className="w-full bg-[#2A2A2A] border border-transparent focus:border-white/20 rounded px-2 py-1.5 text-sm text-white focus:outline-none transition-colors"
                                        placeholder="e.g. First Check"
                                    />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Color</label>
                                    <div className="h-[34px] flex items-center">
                                        <ColorSelect
                                            value={rule.badgeColor}
                                            onChange={(color) => updateRule(rule.id, { badgeColor: color })}
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 min-w-[60px]">
                                    <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Preview</label>
                                    <div className="min-h-[34px] flex items-center">
                                        <span
                                            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white text-center leading-tight max-w-[120px]"
                                            style={{ backgroundColor: rule.badgeColor }}
                                        >
                                            {rule.badgeText || 'Badge'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 pt-5">
                                    <button
                                        onClick={() => deleteRule(rule.id)}
                                        className="p-1.5 text-[#555] hover:text-red-500 transition-colors rounded hover:bg-white/5"
                                        title="Delete rule"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        <div className="flex justify-end pt-1">
                            <button
                                onClick={addRule}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-xs text-[#AAAAAA] hover:text-white rounded transition-colors border border-white/10 hover:border-white/20"
                            >
                                <Plus size={12} />
                                Add check-in
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
