import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from '../Shared/Dropdown';
import { type PackagingSettings, type CheckinRule } from '../../services/settingsService';

interface PackagingSettingsViewProps {
    settings: PackagingSettings;
    onChange: (settings: PackagingSettings) => void;
}

const PRESET_COLORS = [
    '#3B82F6', // Blue
    '#EF4444', // Red
    '#10B981', // Green
    '#F59E0B', // Amber
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#14B8A6', // Teal
];

const ColorSelect: React.FC<{ value: string; onChange: (color: string) => void }> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    return (
        <>
            <button
                ref={setAnchorEl}
                onClick={() => setIsOpen(!isOpen)}
                className="w-8 h-8 rounded-lg bg-[#2A2A2A] border border-transparent hover:border-white/20 flex items-center justify-center transition-colors"
                style={{ backgroundColor: value }}
            >
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: value }} />
            </button>
            <Dropdown
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                anchorEl={anchorEl}
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
        const usedColors = new Set(settings.checkinRules.map(r => r.badgeColor));
        let nextColor = PRESET_COLORS.find(c => !usedColors.has(c));

        // If all colors are used, cycle through them
        if (!nextColor) {
            const nextIndex = settings.checkinRules.length % PRESET_COLORS.length;
            nextColor = PRESET_COLORS[nextIndex];
        }

        const newRule: CheckinRule = {
            id: crypto.randomUUID(),
            hoursAfterPublish: 24, // Default to 1 day
            badgeText: 'New Check',
            badgeColor: nextColor,
            isRequired: true
        };
        onChange({
            ...settings,
            checkinRules: [...settings.checkinRules, newRule]
        });
    };

    const updateRule = (id: string, updates: Partial<CheckinRule>) => {
        const newRules = settings.checkinRules.map(rule =>
            rule.id === id ? { ...rule, ...updates } : rule
        );
        onChange({ ...settings, checkinRules: newRules });
    };

    const deleteRule = (id: string) => {
        const newRules = settings.checkinRules.filter(rule => rule.id !== id);
        onChange({ ...settings, checkinRules: newRules });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-lg font-medium text-white">Packaging Check-ins</h2>
                    <p className="text-sm text-[#AAAAAA]">Configure mandatory check-ins for video packaging</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {settings.checkinRules.length === 0 ? (
                    <div className="bg-[#1F1F1F] p-4 rounded-xl border border-white/5 flex items-center justify-center text-[#555] text-sm">
                        <span>No check-ins configured. <button onClick={addRule} className="text-[#AAAAAA] hover:text-white transition-colors hover:underline">Add one to get started</button></span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {settings.checkinRules.map((rule) => (
                            <div key={rule.id} className="bg-[#1F1F1F] p-3 rounded-xl border border-white/5 flex items-start gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Hours After Publish</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={rule.hoursAfterPublish}
                                        onChange={(e) => updateRule(rule.id, { hoursAfterPublish: parseInt(e.target.value) || 0 })}
                                        className="w-20 bg-[#2A2A2A] border border-transparent focus:border-white/20 rounded px-2 py-1.5 text-sm text-white focus:outline-none transition-colors"
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
