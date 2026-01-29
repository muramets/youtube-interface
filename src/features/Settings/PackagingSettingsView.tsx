import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { Dropdown } from '../../components/ui/molecules/Dropdown';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { type PackagingSettings, type CheckinRule } from '../../core/services/settingsService';

interface PackagingSettingsViewProps {
    settings: PackagingSettings;
    onChange: (settings: PackagingSettings) => void;
    onCleanup: () => Promise<void>;
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

// Badge Preview component with truncation detection and custom tooltip
const BadgePreview: React.FC<{ text: string; color: string }> = ({ text, color }) => {
    const textRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        const checkTruncation = () => {
            if (textRef.current) {
                // Check if text is being clamped (scrollHeight > clientHeight)
                setIsTruncated(textRef.current.scrollHeight > textRef.current.clientHeight);
            }
        };
        checkTruncation();
        // Re-check on text change
    }, [text]);

    const badge = (
        <span
            ref={textRef}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white text-center leading-tight max-w-full line-clamp-2 break-words"
            style={{ backgroundColor: color }}
        >
            {text}
        </span>
    );

    const tooltipContent = (
        <div
            className="px-2 py-1 rounded text-[11px] font-medium text-white"
            style={{ backgroundColor: color }}
        >
            {text}
        </div>
    );

    return (
        <div className="flex flex-col gap-1 w-[100px]">
            <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Preview</label>
            <div className="min-h-[34px] flex items-center justify-center">
                {isTruncated ? (
                    <PortalTooltip
                        content={tooltipContent}
                        className="!p-0 !bg-transparent !border-0 !shadow-none"
                    >
                        {badge}
                    </PortalTooltip>
                ) : (
                    badge
                )}
            </div>
        </div>
    );
};

const RuleItem: React.FC<{
    rule: CheckinRule;
    onUpdate: (id: string, updates: Partial<CheckinRule>) => void;
    onDelete: (id: string) => void;
    isDuplicate?: boolean;
}> = ({ rule, onUpdate, onDelete, isDuplicate }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    // Default to 'days' if not set
    const currentUnit = rule.displayUnit || 'days';
    // Calculate display value based on unit
    const currentValue = currentUnit === 'weeks'
        ? Number((rule.hoursAfterPublish / 168).toFixed(2))
        : Number((rule.hoursAfterPublish / 24).toFixed(2));

    const handleTimeChange = (val: number, unit: 'days' | 'weeks') => {
        // Convert back to hours
        const hours = unit === 'weeks' ? val * 168 : val * 24;
        onUpdate(rule.id, { hoursAfterPublish: hours, displayUnit: unit });
    };

    return (
        <div className={`bg-[#1F1F1F] p-3 rounded-xl border ${isDuplicate ? 'border-red-500' : 'border-white/5'} flex items-start gap-3 transition-colors`}>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Time after publication</label>
                <div className="flex gap-2">
                    <div className="w-16">
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={currentValue}
                            onChange={(e) => handleTimeChange(Math.round(parseFloat(e.target.value)) || 1, currentUnit as 'days' | 'weeks')}
                            className={`w-full bg-[#2A2A2A] border ${isDuplicate ? 'border-red-500' : 'border-transparent focus:border-white/20'} rounded px-2 py-1.5 text-sm text-white focus:outline-none transition-colors no-spinner`}
                            title={isDuplicate ? "This time duration is already used by another rule" : undefined}
                        />
                    </div>
                    <div className="relative w-24">
                        <button
                            onClick={(e) => setAnchorEl(e.currentTarget)}
                            className="w-full flex items-center justify-between bg-[#2A2A2A] border border-transparent hover:border-white/20 rounded px-2 py-1.5 transition-colors"
                        >
                            <span className="text-sm text-white capitalize">{currentUnit}</span>
                            <ChevronDown size={14} className="text-[#AAAAAA]" />
                        </button>
                        <Dropdown
                            isOpen={Boolean(anchorEl)}
                            anchorEl={anchorEl}
                            onClose={() => setAnchorEl(null)}
                            width={96}
                            className="bg-[#2A2A2A] border border-white/10"
                        >
                            {['days', 'weeks'].map((unit) => (
                                <div
                                    key={unit}
                                    className="px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer capitalize"
                                    onClick={() => {
                                        handleTimeChange(currentValue, unit as 'days' | 'weeks');
                                        setAnchorEl(null);
                                    }}
                                >
                                    {unit}
                                </div>
                            ))}
                        </Dropdown>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Badge Text</label>
                <input
                    type="text"
                    value={rule.badgeText}
                    onChange={(e) => onUpdate(rule.id, { badgeText: e.target.value })}
                    className="w-full bg-[#2A2A2A] border border-transparent focus:border-white/20 rounded px-2 py-1.5 text-sm text-white focus:outline-none transition-colors"
                    placeholder="e.g. First Check"
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#AAAAAA] uppercase tracking-wider font-medium">Color</label>
                <div className="h-[34px] flex items-center">
                    <ColorSelect
                        value={rule.badgeColor}
                        onChange={(color) => onUpdate(rule.id, { badgeColor: color })}
                    />
                </div>
            </div>

            <BadgePreview text={rule.badgeText || 'Badge'} color={rule.badgeColor} />

            <div className="flex flex-col gap-1 pt-5">
                <button
                    onClick={() => onDelete(rule.id)}
                    className="p-1.5 text-[#555] hover:text-red-500 transition-colors rounded hover:bg-white/5"
                    title="Delete rule"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
};

export const PackagingSettingsView: React.FC<PackagingSettingsViewProps> = ({ settings, onChange, onCleanup }) => {
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
            isRequired: true,
            displayUnit: 'days'
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

    // Calculate duplicates
    const duplicateHours = new Set<number>();
    const hoursSeen = new Set<number>();
    settings.checkinRules.forEach(rule => {
        if (hoursSeen.has(rule.hoursAfterPublish)) {
            duplicateHours.add(rule.hoursAfterPublish);
        } else {
            hoursSeen.add(rule.hoursAfterPublish);
        }
    });

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-lg font-medium text-white">Packaging Check-ins</h2>
                    <p className="text-sm text-[#AAAAAA]">Configure mandatory check-ins for video packaging</p>
                </div>
                <button
                    onClick={() => {
                        if (confirm('Verify and cleanup all check-in data across videos? This will remove orphaned check-ins.')) {
                            onCleanup();
                        }
                    }}
                    className="text-xs text-[#555] hover:text-[#AAAAAA] underline transition-colors"
                >
                    Diff / Cleanup Data
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {settings.checkinRules.length === 0 ? (
                    <div className="bg-[#1F1F1F] p-4 rounded-xl border border-white/5 flex items-center justify-center text-[#555] text-sm">
                        <span>No check-ins configured. <button onClick={addRule} className="text-[#AAAAAA] hover:text-white transition-colors hover:underline">Add one to get started</button></span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {settings.checkinRules.map((rule) => (
                            <RuleItem
                                key={rule.id}
                                rule={rule}
                                onUpdate={updateRule}
                                onDelete={deleteRule}
                                isDuplicate={duplicateHours.has(rule.hoursAfterPublish)}
                            />
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
