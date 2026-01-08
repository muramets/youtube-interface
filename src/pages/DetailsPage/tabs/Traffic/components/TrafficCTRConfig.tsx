import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dropdown } from '../../../../../components/Shared/Dropdown';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useSettings } from '../../../../../core/hooks/useSettings';
import type { CTRRule } from '../../../../../core/services/settingsService';

const PRESET_COLORS = [
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#e4d90aff', // Yellow    
    '#10B981', // Green
    '#3B82F6', // Blue
    '#8B5CF6', // Violet
    '#EC4899', // Pink
];

const ColorSelect: React.FC<{ value: string; onChange: (color: string) => void }> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    return (
        <>
            <button
                ref={setAnchorEl}
                onClick={() => setIsOpen(!isOpen)}
                className="w-5 h-5 rounded bg-[#2A2A2A] border border-transparent hover:border-white/20 flex items-center justify-center transition-colors"
                style={{ backgroundColor: value }}
            >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: value }} />
            </button>
            <Dropdown
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                anchorEl={anchorEl}
                width={32}
                align="left"
                className="p-1 ctr-config-dropdown"
                zIndexClass="z-popover"
            >
                <div className="flex flex-col gap-1">
                    {PRESET_COLORS.map(color => (
                        <button
                            key={color}
                            onClick={() => {
                                onChange(color);
                                setIsOpen(false);
                            }}
                            className={`w-full h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors ${value === color ? 'bg-white/5' : ''}`}
                        >
                            <div
                                className={`w-3 h-3 rounded-full transition-transform ${value === color ? 'ring-1 ring-white scale-110' : ''}`}
                                style={{ backgroundColor: color }}
                            />
                        </button>
                    ))}
                </div>
            </Dropdown>
        </>
    );
};

const OperatorSelect: React.FC<{ value: string; onChange: (op: CTRRule['operator']) => void }> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    const options: { label: string; value: CTRRule['operator'] }[] = [
        { label: '<', value: '<' },
        { label: '>', value: '>' },
        { label: '<=', value: '<=' },
        { label: '>=', value: '>=' },
        { label: 'Between', value: 'between' },
    ];

    return (
        <>
            <button
                ref={setAnchorEl}
                onClick={() => setIsOpen(!isOpen)}
                className="h-7 px-2 bg-[#2A2A2A] text-white text-xs rounded flex items-center gap-1 hover:bg-[#333] transition-colors min-w-[40px] justify-center"
            >
                {value === 'between' ? 'Between' : value}
            </button>
            <Dropdown
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                anchorEl={anchorEl}
                width={80}
                align="left"
                className="p-1 ctr-config-dropdown"
                zIndexClass="z-popover"
            >
                <div className="flex flex-col gap-1">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-2 py-1.5 text-xs text-text-primary hover:bg-white/10 rounded transition-colors ${value === opt.value ? 'bg-white/5' : ''}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </Dropdown>
        </>
    );
};

// Sortable Rule Item Component
interface SortableRuleItemProps {
    rule: CTRRule;
    onUpdate: (id: string, updates: Partial<CTRRule>) => void;
    onRemove: (id: string) => void;
    onBlur: () => void;
    showHandle: boolean;
}

const SortableRuleItem: React.FC<SortableRuleItemProps> = ({ rule, onUpdate, onRemove, onBlur, showHandle }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: rule.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        zIndex: isDragging ? 50 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 px-2 py-1.5 bg-[#252525] rounded-lg group w-full overflow-hidden ${!isDragging ? 'transition-all' : ''}`}
        >
            {/* Drag Handle */}
            {showHandle && (
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-primary transition-colors touch-none shrink-0"
                >
                    <GripVertical size={14} />
                </div>
            )}

            <OperatorSelect
                value={rule.operator}
                onChange={(op) => onUpdate(rule.id, { operator: op })}
            />

            <div className="flex-1 flex justify-center">
                {rule.operator === 'between' ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={rule.value}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^\d.]/g, '');
                                onUpdate(rule.id, { value: Number(val) });
                            }}
                            onBlur={onBlur}
                            className="w-10 h-7 bg-transparent text-text-primary text-xs font-medium focus:bg-[#2A2A2A] rounded px-1 focus:outline-none text-center transition-colors"
                        />
                        <span className="text-[10px] text-text-tertiary">-</span>
                        <input
                            type="text"
                            value={rule.maxValue || ''}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^\d.]/g, '');
                                onUpdate(rule.id, { maxValue: Number(val) });
                            }}
                            onBlur={onBlur}
                            className="w-10 h-7 bg-transparent text-text-primary text-xs font-medium focus:bg-[#2A2A2A] rounded px-1 focus:outline-none text-center transition-colors"
                        />
                    </div>
                ) : (
                    <div className="relative flex items-center">
                        <input
                            type="text"
                            value={rule.value}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^\d.]/g, '');
                                onUpdate(rule.id, { value: Number(val) });
                            }}
                            onBlur={onBlur}
                            className="w-10 h-7 bg-transparent text-text-primary text-xs font-medium focus:bg-[#2A2A2A] rounded px-1 focus:outline-none text-center transition-colors"
                        />
                        <span className="ml-0.5 text-[10px] text-text-tertiary pointer-events-none">%</span>
                    </div>
                )}
            </div>

            <ColorSelect
                value={rule.color}
                onChange={(color) => onUpdate(rule.id, { color })}
            />

            <button
                onClick={() => onRemove(rule.id)}
                className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-500 transition-all p-1.5"
            >
                <Trash2 size={13} />
            </button>
        </div>
    );
};

interface TrafficCTRConfigProps {
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<any>;
}

export const TrafficCTRConfig: React.FC<TrafficCTRConfigProps> = ({ isOpen, onClose, anchorRef }) => {
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { trafficSettings, updateTrafficSettings } = useSettings();
    const rules = trafficSettings?.ctrRules || [];

    useLayoutEffect(() => {
        if (isOpen && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            // Position it to the left of the button
            setPosition({
                top: rect.bottom + 8,
                left: rect.right - 280 // Shift left (width is 280)
            });
        }
    }, [isOpen, anchorRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            // Check for our specific dropdown class
            const isInDropdown = target.closest('.ctr-config-dropdown');

            if (popupRef.current && !popupRef.current.contains(target as Node) &&
                anchorRef.current && !anchorRef.current.contains(target as Node) &&
                !isInDropdown) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside, true);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isOpen, onClose, anchorRef]);



    const saveRules = async (newRules: CTRRule[]) => {
        if (!user?.uid || !currentChannel?.id) return;
        try {
            await updateTrafficSettings(user.uid, currentChannel.id, { ctrRules: newRules });
        } catch (e) {
            console.error("Failed to save CTR rules", e);
        }
    };

    const addRule = () => {
        const lastRule = rules[rules.length - 1];
        let nextValue = 5;
        let nextColor = PRESET_COLORS[0];

        if (lastRule) {
            nextValue = lastRule.value + 1;
            const colorIndex = PRESET_COLORS.indexOf(lastRule.color);
            if (colorIndex !== -1) {
                nextColor = PRESET_COLORS[(colorIndex + 1) % PRESET_COLORS.length];
            }
        }

        // Save
        saveRules([
            ...rules,
            { id: crypto.randomUUID(), operator: '<', value: nextValue, color: nextColor }
        ]);
    };

    const updateRule = (id: string, updates: Partial<CTRRule>) => {
        const newRules = rules.map(r => {
            if (r.id !== id) return r;
            const updated = { ...r, ...updates };
            if (updated.value > 100) updated.value = 100;
            if (updated.maxValue !== undefined && updated.maxValue > 100) updated.maxValue = 100;
            return updated;
        });
        saveRules(newRules);
    };

    const removeRule = (id: string) => {
        saveRules(rules.filter(r => r.id !== id));
    };

    // Drag and drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 3, // Small distance to prevent accidental drags while keeping it responsive
            },
        })
    );

    const handleDragEnd = (event: any) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = rules.findIndex((r) => r.id === active.id);
            const newIndex = rules.findIndex((r) => r.id === over.id);

            const reorderedRules = arrayMove(rules, oldIndex, newIndex);
            saveRules(reorderedRules);
        }
    };

    if (!isOpen || !position) return null;

    return createPortal(
        <div
            ref={popupRef}
            style={{ top: position.top, left: position.left }}
            className="fixed z-dropdown w-[280px] bg-[#1F1F1F] rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        >
            {/* Header matching View Mode style */}
            <div className="px-4 py-3 border-b border-[#2a2a2a] flex justify-between items-center">
                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                    CTR Color Rules
                </span>
                <button
                    onClick={onClose}
                    className="text-text-tertiary hover:text-text-primary transition-colors focus:outline-none"
                >
                    <X size={14} />
                </button>
            </div>

            <div className="flex flex-col max-h-[400px] overflow-y-auto overflow-x-hidden custom-scrollbar p-2">
                {rules.length === 0 ? (
                    <div className="flex items-center justify-center h-[40px] text-text-tertiary text-xs">
                        No rules yet.
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                        modifiers={[restrictToVerticalAxis]}
                    >
                        <SortableContext
                            items={rules.map(r => r.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="flex flex-col gap-2 overflow-hidden">
                                {rules.map((rule) => (
                                    <SortableRuleItem
                                        key={rule.id}
                                        rule={rule}
                                        onUpdate={updateRule}
                                        onRemove={removeRule}
                                        onBlur={() => { }}
                                        showHandle={rules.length > 1}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* Footer Action */}
            <div className="p-2 border-t border-[#2a2a2a]">
                <button
                    onClick={addRule}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg transition-colors"
                >
                    <Plus size={14} />
                    Add Rule
                </button>
            </div>
        </div>,
        document.body
    );
};
