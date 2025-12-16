import React, { useState, useRef, useEffect } from 'react';
import { Filter, ChevronRight, X, Calendar, Eye, ChevronLeft } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTrendStore } from '../../../stores/trendStore';
import { FilterInputDate } from '../../Shared/FilterInputs/FilterInputDate';
import { FilterInputNumeric } from '../../Shared/FilterInputs/FilterInputNumeric';
import type { FilterOperator } from '../../../stores/filterStore';

type TrendsFilterType = 'date' | 'views';

export const TrendsFilterButton: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

    // State for Navigation (Main vs Submenu)
    const [activeView, setActiveView] = useState<TrendsFilterType | 'main'>('main');

    const { addTrendsFilter, trendsFilters } = useTrendStore();

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right
            });
        } else {
            // Reset view when closed
            const timeout = setTimeout(() => setActiveView('main'), 200);
            return () => clearTimeout(timeout);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (target.closest('#custom-select-dropdown')) {
                return;
            }

            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('resize', () => setIsOpen(false));
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', () => setIsOpen(false));
        };
    }, [isOpen]);

    const handleAddFilter = (type: TrendsFilterType, operator: FilterOperator, value: any, label: string) => {
        addTrendsFilter({ type, operator, value, label });
        setIsOpen(false);
    };

    const filterTypes: { type: TrendsFilterType; label: string; icon: React.FC<any> }[] = [
        { type: 'date', label: 'Publish Date', icon: Calendar },
        { type: 'views', label: 'Views', icon: Eye },
    ];

    const getTitleForView = (view: TrendsFilterType) => {
        const match = filterTypes.find(t => t.type === view);
        return match ? match.label : 'Filter';
    };

    return (
        <>
            <button
                ref={buttonRef}
                className={`w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 ${isOpen ? 'bg-text-primary text-bg-primary' : 'bg-transparent text-text-primary hover:bg-hover-bg'}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Filter"
            >
                <Filter size={20} />
                {trendsFilters.length > 0 && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-bg-primary" />
                )}
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[1000] bg-[#1F1F1F] rounded-xl shadow-2xl overflow-hidden animate-scale-in flex flex-col"
                    style={{
                        top: position.top,
                        right: position.right,
                        width: activeView === 'date' ? '288px' : 'auto'
                    }}
                >
                    {/* Header for Submenus */}
                    {activeView !== 'main' && (
                        <div className="flex items-center justify-between px-2 py-2 border-b border-[#333333]">
                            <button
                                onClick={() => setActiveView('main')}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-bold text-text-primary">{getTitleForView(activeView)}</span>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    )}

                    {/* Content Area */}
                    <div className="flex flex-col">
                        {activeView === 'main' ? (
                            <div className="py-2">
                                {filterTypes.map(({ type, label, icon: Icon }) => (
                                    <button
                                        key={type}
                                        onClick={() => setActiveView(type)}
                                        className="w-full text-left px-4 py-3 text-sm font-medium flex items-center justify-between gap-8 transition-colors border-none cursor-pointer text-text-primary hover:bg-[#161616] bg-transparent"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon size={18} className="text-text-secondary" />
                                            {label}
                                        </div>
                                        <ChevronRight size={16} className="text-text-secondary" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="animate-fade-in">
                                {activeView === 'views' && (
                                    <FilterInputNumeric
                                        onApply={(op, val, max) => {
                                            const opLabel = op === 'between' ? `${val}-${max}` : `${op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'gt' ? '>' : op === 'lt' ? '<' : '='} ${val}`;
                                            handleAddFilter('views', op, op === 'between' ? [val, max] : val, `Views ${opLabel}`);
                                        }}
                                    />
                                )}
                                {activeView === 'date' && (
                                    <FilterInputDate
                                        onApply={(start, end) => {
                                            const startStr = new Date(start).toLocaleDateString();
                                            const endStr = new Date(end).toLocaleDateString();
                                            const label = start === end ? `Date: ${startStr}` : `Date: ${startStr} - ${endStr}`;
                                            handleAddFilter('date', 'between', [start, end], label);
                                        }}
                                        onClose={() => setIsOpen(false)}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
