import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import { CTRRulesList } from './CTRRulesList';
import { useCTRRules } from '../hooks/useCTRRules';

interface TrafficCTRConfigProps {
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<any>;
}

/**
 * Модальное окно для настройки CTR правил.
 * Использует useCTRRules для бизнес-логики и CTRRulesList для UI.
 */
export const TrafficCTRConfig: React.FC<TrafficCTRConfigProps> = ({ isOpen, onClose, anchorRef }) => {
    const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const { rules, addRule, updateRule, removeRule, reorderRules } = useCTRRules();

    // Позиционирование относительно кнопки
    useLayoutEffect(() => {
        if (isOpen && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                left: rect.right - 280 // Shift left (width is 280)
            });
        }
    }, [isOpen, anchorRef]);

    // Закрытие при клике вне
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
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

    if (!isOpen || !position) return null;

    return createPortal(
        <div
            ref={popupRef}
            style={{ top: position.top, left: position.left }}
            className="fixed z-dropdown w-[280px] bg-[#1F1F1F] rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        >
            {/* Header */}
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

            {/* Rules List */}
            <div className="flex flex-col max-h-[400px] overflow-y-auto overflow-x-hidden custom-scrollbar p-2">
                <CTRRulesList
                    rules={rules}
                    onUpdate={updateRule}
                    onRemove={removeRule}
                    onReorder={reorderRules}
                />
            </div>

            {/* Footer - Add Rule Button */}
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
