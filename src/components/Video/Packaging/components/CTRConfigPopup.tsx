import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, ChevronDown } from 'lucide-react';
import { Dropdown } from '../../../Shared/Dropdown';
import type { CTRRule } from '../types';

const OperatorSelect: React.FC<{
    value: CTRRule['operator'];
    onChange: (value: CTRRule['operator']) => void;
}> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const options: { value: CTRRule['operator']; label: string }[] = [
        { value: '<', label: '<' },
        { value: '>', label: '>' },
        { value: '<=', label: '≤' },
        { value: '>=', label: '≥' },
        { value: 'between', label: 'Range' },
    ];

    const selectedLabel = options.find(o => o.value === value)?.label;

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`${value === 'between' ? 'w-16' : 'w-10'} h-7 flex items-center justify-center gap-1 bg-[#2A2A2A] hover:bg-[#333] text-white text-xs rounded px-2 transition-colors border border-transparent focus:border-white/20`}
            >
                <span>{selectedLabel}</span>
                <ChevronDown size={10} className="text-[#AAAAAA]" />
            </button>
            <Dropdown
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                anchorEl={buttonRef.current}
                width={80}
                align="left"
                className="py-1"
            >
                {options.map(option => (
                    <button
                        key={option.value}
                        onClick={() => {
                            onChange(option.value);
                            setIsOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${value === option.value ? 'text-white font-medium bg-white/5' : 'text-[#CCCCCC]'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </Dropdown>
        </>
    );
};

const ColorSelect: React.FC<{
    value: string;
    onChange: (value: string) => void;
}> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const COLORS = [
        '#EF4444', // Red
        '#F97316', // Orange
        '#EAB308', // Yellow
        '#22C55E', // Green
        '#3B82F6', // Blue
        '#A855F7', // Purple
    ];

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
                    {COLORS.map(color => (
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

export const CTRConfigPopup: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    rules: CTRRule[];
    onSave: (rules: CTRRule[]) => void;
    anchorRef: React.RefObject<HTMLElement | null>;
}> = ({ isOpen, onClose, rules, onSave, anchorRef }) => {
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    React.useLayoutEffect(() => {
        if (isOpen && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                left: rect.left - 100 // Shift left to align better
            });
        }
    }, [isOpen, anchorRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Check if click is inside the popup OR inside any portal (dropdowns)
            const target = event.target as HTMLElement;
            const isInDropdown = target.closest('.z-\\[10000\\]');

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

    if (!isOpen || !position) return null;

    const addRule = () => {
        onSave([
            ...rules,
            { id: crypto.randomUUID(), operator: '<', value: 5, color: '#EF4444' }
        ]);
    };

    const updateRule = (id: string, updates: Partial<CTRRule>) => {
        const newRules = rules.map(r => {
            if (r.id !== id) return r;

            const updated = { ...r, ...updates };

            // Clamp values
            if (updated.value > 100) updated.value = 100;
            if (updated.maxValue !== undefined && updated.maxValue > 100) updated.maxValue = 100;

            return updated;
        });
        onSave(newRules);
    };

    const removeRule = (id: string) => {
        onSave(rules.filter(r => r.id !== id));
    };

    return createPortal(
        <div
            ref={popupRef}
            style={{ top: position.top, left: position.left }}
            className="fixed z-[9999] w-auto min-w-[220px] bg-[#1F1F1F] border border-white/10 rounded-xl shadow-2xl p-3 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-xs font-bold text-[#AAAAAA] uppercase tracking-wider">CTR Color Rules</span>
                <button onClick={onClose} className="text-[#AAAAAA] hover:text-red-500 transition-colors">
                    <X size={14} />
                </button>
            </div>

            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                <div className="text-center py-4 text-[#555] text-xs">
                    No rules yet. <button onClick={addRule} className="text-[#AAAAAA] hover:text-white transition-colors">Add rule</button>
                </div>
                ) : (
                <>
                    {rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-white/5">
                            {/* Operator */}
                            <OperatorSelect
                                value={rule.operator}
                                onChange={(op) => updateRule(rule.id, { operator: op })}
                            />

                            {/* Value(s) */}
                            <div className="flex-1 flex justify-center">
                                {rule.operator === 'between' ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="text"
                                            value={rule.value}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^\d.]/g, '');
                                                updateRule(rule.id, { value: Number(val) });
                                            }}
                                            className="w-9 h-7 bg-[#2A2A2A] text-white text-xs rounded px-1 focus:outline-none text-center border border-transparent focus:border-white/20"
                                        />
                                        <span className="text-[9px] text-[#555]">-</span>
                                        <input
                                            type="text"
                                            value={rule.maxValue || ''}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^\d.]/g, '');
                                                updateRule(rule.id, { maxValue: Number(val) });
                                            }}
                                            className="w-9 h-7 bg-[#2A2A2A] text-white text-xs rounded px-1 focus:outline-none text-center border border-transparent focus:border-white/20"
                                        />
                                    </div>
                                ) : (
                                    <div className="relative flex items-center">
                                        <input
                                            type="text"
                                            value={rule.value}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^\d.]/g, '');
                                                updateRule(rule.id, { value: Number(val) });
                                            }}
                                            className="w-12 h-7 bg-[#2A2A2A] text-white text-xs rounded px-2 focus:outline-none text-center border border-transparent focus:border-white/20"
                                        />
                                        <span className="absolute right-1 text-[9px] text-[#555] pointer-events-none">%</span>
                                    </div>
                                )}
                            </div>

                            {/* Color Picker */}
                            <ColorSelect
                                value={rule.color}
                                onChange={(color) => updateRule(rule.id, { color })}
                            />

                            {/* Delete */}
                            <button
                                onClick={() => removeRule(rule.id)}
                                className="text-[#555] hover:text-red-500 transition-colors p-1.5 hover:bg-white/5 rounded"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </>
                )}
            </div>

            {rules.length > 0 && (
                <div className="flex gap-2 mt-1">
                    <button
                        onClick={addRule}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white/5 hover:bg-white/10 text-[10px] text-[#AAAAAA] hover:text-white rounded transition-colors border border-white/10 hover:border-white/20"
                    >
                        <Plus size={10} />
                        Add Rule
                    </button>
                </div>
            )}
        </div>,
        document.body
    );
};
