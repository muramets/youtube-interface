import React from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, GripVertical } from 'lucide-react';
import { Dropdown } from '../../../../../components/ui/molecules/Dropdown';
import { PRESET_COLORS } from '../utils/constants';
import type { CTRRule } from '../../../../../core/services/settingsService';
import { useState } from 'react';

// Color Select Component
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

// Operator Select Component
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

// Sortable Rule Item
interface SortableRuleItemProps {
    rule: CTRRule;
    onUpdate: (id: string, updates: Partial<CTRRule>) => void;
    onRemove: (id: string) => void;
    showHandle: boolean;
}

const SortableRuleItem: React.FC<SortableRuleItemProps> = ({ rule, onUpdate, onRemove, showHandle }) => {
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
            className={`flex items-center gap-2 px-2 py-1.5 bg-[#252525] rounded-lg group w-full overflow-hidden ${!isDragging ? 'transition-colors' : ''}`}
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

// Main CTR Rules List Component
interface CTRRulesListProps {
    rules: CTRRule[];
    onUpdate: (id: string, updates: Partial<CTRRule>) => void;
    onRemove: (id: string) => void;
    onReorder: (newRules: CTRRule[]) => void;
}

export const CTRRulesList: React.FC<CTRRulesListProps> = ({ rules, onUpdate, onRemove, onReorder }) => {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 3, // Small distance to prevent accidental drags
            },
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = rules.findIndex((r) => r.id === active.id);
            const newIndex = rules.findIndex((r) => r.id === over.id);

            const reorderedRules = arrayMove(rules, oldIndex, newIndex);
            onReorder(reorderedRules);
        }
    };

    if (rules.length === 0) {
        return (
            <div className="flex items-center justify-center h-[40px] text-text-tertiary text-xs">
                No rules yet.
            </div>
        );
    }

    return (
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
                            onUpdate={onUpdate}
                            onRemove={onRemove}
                            showHandle={rules.length > 1}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
};
