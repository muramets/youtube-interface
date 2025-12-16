import React, { useState, useRef, useEffect } from 'react';
import { Filter, ChevronRight, X, Calendar, Eye, ChevronLeft, BarChart3 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTrendStore, type PercentileGroup } from '../../../stores/trendStore';
import { FilterInputDate } from '../../Shared/FilterInputs/FilterInputDate';
import { FilterInputNumeric } from '../../Shared/FilterInputs/FilterInputNumeric';
import { FilterInputPercentile } from '../../Shared/FilterInputs/FilterInputPercentile';
import type { FilterOperator } from '../../../stores/filterStore';

type TrendsFilterType = 'date' | 'views' | 'percentile';

export const TrendsFilterButton: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

    // State for Navigation (Main vs Submenu)
    const [activeView, setActiveView] = useState<TrendsFilterType | 'main'>('main');

    const { addTrendsFilter, removeTrendsFilter, trendsFilters, filterMode, setFilterMode } = useTrendStore();

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
        { type: 'percentile', label: 'Percentile', icon: BarChart3 },
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
                                <div className="px-4 py-3 mb-1 border-b border-[#2a2a2a]">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Context</span>
                                    </div>
                                    {/* Segmented Toggle */}
                                    <div className="relative flex bg-[#1a1a1a] rounded-lg p-0.5">
                                        {/* Sliding Indicator */}
                                        <div
                                            className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-gradient-to-r from-[#2d2d2d] to-[#333333] rounded-md shadow-sm transition-all duration-200 ease-out"
                                            style={{ left: filterMode === 'global' ? '2px' : 'calc(50% + 0px)' }}
                                        />
                                        <button
                                            onClick={() => setFilterMode('global')}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors duration-200 border-none cursor-pointer bg-transparent ${filterMode === 'global'
                                                ? 'text-text-primary'
                                                : 'text-text-tertiary hover:text-text-secondary'
                                                }`}
                                        >
                                            Global
                                        </button>
                                        <button
                                            onClick={() => setFilterMode('filtered')}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors duration-200 border-none cursor-pointer bg-transparent ${filterMode === 'filtered'
                                                ? 'text-text-primary'
                                                : 'text-text-tertiary hover:text-text-secondary'
                                                }`}
                                        >
                                            Filtered
                                        </button>
                                    </div>
                                    <div className="mt-2 text-[10px] text-text-tertiary leading-relaxed grid">
                                        <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${filterMode === 'global' ? 'opacity-100' : 'opacity-0'}`}>
                                            Maintain original scale when filtering
                                        </span>
                                        <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${filterMode === 'filtered' ? 'opacity-100' : 'opacity-0'}`}>
                                            Rescale to fit visible data
                                        </span>
                                    </div>
                                </div>

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
                                {activeView === 'percentile' && (
                                    <FilterInputPercentile
                                        initialExcluded={trendsFilters.find(f => f.type === 'percentile')?.value || []}
                                        onApply={(excluded: PercentileGroup[]) => {
                                            // Remove existing percentile filter first
                                            const existingFilter = trendsFilters.find(f => f.type === 'percentile');
                                            if (existingFilter) {
                                                removeTrendsFilter(existingFilter.id);
                                            }
                                            // Add new filter with updated exclusions (if any)
                                            if (excluded.length > 0) {
                                                const label = excluded.length === 1
                                                    ? `Hide: ${excluded[0]}`
                                                    : `Hide: ${excluded.length} groups`;
                                                addTrendsFilter({ type: 'percentile', operator: 'equals', value: excluded, label });
                                            }
                                            setIsOpen(false);
                                        }}
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
