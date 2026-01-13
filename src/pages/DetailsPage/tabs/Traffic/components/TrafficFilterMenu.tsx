import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Eye, Clock, BarChart3, Percent, Layers, Sparkles, MousePointerClick, HelpCircle, Wand2, Users, Zap, ZapOff, Compass, Target, Coffee, Flag, CircleOff, Check } from 'lucide-react';
import { Checkbox } from '../../../../../components/ui/atoms/Checkbox/Checkbox';
import { SegmentedControl } from '../../../../../components/ui/molecules/SegmentedControl';
import { FilterInputNumeric } from '../../../../../components/Shared/FilterInputs/FilterInputNumeric';
import { TrafficFilterInputNiche, UNASSIGNED_NICHE_ID } from './TrafficFilterInputNiche';
import type { TrafficFilterType, TrafficFilter } from '../hooks/useTrafficFilters';
import type { FilterOperator } from '../../../../../core/stores/filterStore';
import type { TrafficGroup, TrafficSource } from '../../../../../core/types/traffic';
import { formatDuration } from '../utils/formatters';

interface TrafficFilterMenuProps {
    viewMode: 'cumulative' | 'delta';
    onViewModeChange: (mode: 'cumulative' | 'delta') => void;
    filters: TrafficFilter[];
    onAddFilter: (filter: Omit<TrafficFilter, 'id'>) => void;
    onRemoveFilter: (id: string) => void;
    onClose: () => void;
    groups?: TrafficGroup[];
    sources?: TrafficSource[];
}

export const TrafficFilterMenu: React.FC<TrafficFilterMenuProps> = ({
    viewMode,
    onViewModeChange,
    filters,
    onAddFilter,
    onRemoveFilter,
    onClose,
    groups,
    sources
}) => {
    // Navigation State
    const [activeView, setActiveView] = useState<TrafficFilterType | 'main'>('main');

    const filterTypes: { type: TrafficFilterType; label: string; icon: React.FC<any> }[] = [
        { type: 'impressions', label: 'Impressions', icon: Eye },
        { type: 'ctr', label: 'CTR', icon: Percent },
        { type: 'views', label: 'Views', icon: BarChart3 },
        { type: 'avgViewDuration', label: 'Average View Duration', icon: Clock },
        { type: 'niche', label: 'Niche', icon: Layers },
        { type: 'trafficType', label: 'Traffic Type', icon: Sparkles },
        { type: 'viewerType', label: 'Viewer Type', icon: Users },
        { type: 'nicheProperty', label: 'Niche Type', icon: Flag },
    ];

    const getTitleForView = (view: TrafficFilterType) => {
        const match = filterTypes.find(t => t.type === view);
        return match ? match.label : 'Filter';
    };

    const handleApplyFilter = (type: TrafficFilterType, operator: FilterOperator, value: any, maxValue?: any) => {
        // Generate label
        let label = '';
        const opLabel = operator === 'between' ? '-' : operator === 'gte' ? '>=' : operator === 'lte' ? '<=' : operator === 'gt' ? '>' : operator === 'lt' ? '<' : '=';

        if (type === 'avgViewDuration') {
            const valStr = formatDuration(value.toString()); // Value passed from SmartDurationInput is seconds number
            const maxStr = maxValue ? formatDuration(maxValue.toString()) : '';
            label = operator === 'between'
                ? `AVD: ${valStr} - ${maxStr}`
                : `AVD ${opLabel} ${valStr}`;
        } else if (type === 'ctr') {
            const valStr = value + '%';
            const maxStr = maxValue ? maxValue + '%' : '';
            label = operator === 'between'
                ? `CTR: ${valStr} - ${maxStr}`
                : `CTR ${opLabel} ${valStr}`;
        } else {
            // Impressions / Views
            const metricName = type === 'impressions' ? 'Impr.' : 'Views';
            const valStr = value.toLocaleString();
            const maxStr = maxValue ? maxValue.toLocaleString() : '';
            label = operator === 'between'
                ? `${metricName}: ${valStr} - ${maxStr}`
                : `${metricName} ${opLabel} ${valStr}`;
        }

        // Final value object for hook
        // For range, value is [min, max]
        const finalValue = operator === 'between' ? [value, maxValue] : value;

        onAddFilter({
            type,
            operator,
            value: finalValue,
            label
        });
    };

    // Find existing filter of current type to pre-fill
    // Note: This finds the MAIN filter (views/impressions/ctr/avd)
    const existingFilter = filters.find(f => f.type === activeView);
    const initialVal = existingFilter?.value;
    const isRange = Array.isArray(initialVal);

    return (
        <div className="flex flex-col w-[280px]">
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
                        onClick={onClose}
                        className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* View Content Switcher */}
            {(() => {
                switch (activeView) {
                    case 'main':
                        return (
                            <div className="py-2">
                                {/* View Mode Section */}
                                <div className="px-4 py-3 mb-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                                            View Mode
                                        </span>
                                    </div>
                                    <SegmentedControl
                                        options={[
                                            { label: 'Total', value: 'cumulative' },
                                            { label: 'New', value: 'delta' }
                                        ]}
                                        value={viewMode}
                                        onChange={(v: any) => onViewModeChange(v)}
                                    />
                                    <div className="mt-2 text-[10px] text-text-tertiary leading-relaxed grid">
                                        <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${viewMode === 'cumulative' ? 'opacity-100' : 'opacity-0'}`}>
                                            Show total accumulated views
                                        </span>
                                        <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${viewMode === 'delta' ? 'opacity-100' : 'opacity-0'}`}>
                                            Show new views since last snapshot
                                        </span>
                                    </div>
                                </div>

                                {/* Separator */}
                                <div className="h-px bg-[#2a2a2a] mx-4 mb-1.5" />

                                {/* Add Filter Section - COMPACT SPACING */}
                                <div className="px-4 pt-1.5 pb-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                                            Add Filter
                                        </span>
                                    </div>
                                </div>

                                {filterTypes.map(({ type, label, icon: Icon }) => {
                                    // Check if filter exists
                                    const isActive = filters.some(f => f.type === type);

                                    return (
                                        <button
                                            key={type}
                                            onClick={() => setActiveView(type)}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-8 transition-colors border-none cursor-pointer text-text-primary hover:bg-[#161616] bg-transparent group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Icon size={16} className={`transition-colors ${isActive ? 'text-accent-blue' : 'text-text-secondary group-hover:text-text-primary'}`} />
                                                <span className={isActive ? 'text-accent-blue' : ''}>{label}</span>
                                            </div>
                                            <ChevronRight size={16} className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    );
                                })}
                            </div>
                        );

                    case 'niche':
                        return groups ? (
                            <TrafficFilterInputNiche
                                groups={groups}
                                sources={sources || []}
                                initialSelected={existingFilter?.value || []}
                                onApply={(selectedIds) => {
                                    if (existingFilter) {
                                        onRemoveFilter(existingFilter.id);
                                    }
                                    if (selectedIds.length > 0) {
                                        // Format label
                                        const names = groups
                                            .filter(g => selectedIds.includes(g.id))
                                            .map(g => g.name);

                                        if (selectedIds.includes(UNASSIGNED_NICHE_ID)) {
                                            names.push('Unassigned');
                                        }

                                        const label = names.length === 1
                                            ? `Niche: ${names[0]}`
                                            : `Niche: ${names.length} selected`;

                                        onAddFilter({
                                            type: 'niche',
                                            operator: 'contains',
                                            value: selectedIds,
                                            label
                                        });
                                    }
                                    // Don't close immediately to allow multi-select
                                }}
                            />
                        ) : (
                            <div className="p-4 text-xs text-text-tertiary">Data not available</div>
                        );

                    case 'nicheProperty':
                        const currentNichePropertyVal = existingFilter?.value;
                        const selectedNicheProperties: string[] = Array.isArray(currentNichePropertyVal) ? currentNichePropertyVal : (currentNichePropertyVal ? [currentNichePropertyVal] : []);

                        return (
                            <div className="flex flex-col h-full overflow-hidden">
                                <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                                    {[
                                        { id: 'desired', label: 'Desired', icon: Flag, color: 'text-emerald-400', hover: 'group-hover:text-emerald-400' },
                                        { id: 'targeted', label: 'Targeted', icon: Target, color: 'text-yellow-400', hover: 'group-hover:text-yellow-400' },
                                        { id: 'adjacent', label: 'Adjacent', icon: Layers, color: 'text-blue-400', hover: 'group-hover:text-blue-400' },
                                        { id: 'unrelated', label: 'Unrelated', icon: CircleOff, color: 'text-red-400', hover: 'group-hover:text-red-400' }
                                    ].map(option => {
                                        const isSelected = selectedNicheProperties.includes(option.id);
                                        return (
                                            <div
                                                key={option.id}
                                                onClick={() => {
                                                    let newSelection: string[] = [...selectedNicheProperties];
                                                    if (isSelected) {
                                                        newSelection = newSelection.filter((v: string) => v !== option.id);
                                                    } else {
                                                        newSelection.push(option.id);
                                                    }

                                                    if (newSelection.length === 0) {
                                                        if (existingFilter) onRemoveFilter(existingFilter.id);
                                                    } else {
                                                        const label = newSelection.length === 1
                                                            ? `Niche Type: ${option.label}`
                                                            : `Niche Type: ${newSelection.length} selected`;

                                                        onAddFilter({
                                                            type: 'nicheProperty',
                                                            operator: 'contains',
                                                            value: newSelection,
                                                            label
                                                        });
                                                    }
                                                }}
                                                className="px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors rounded-lg text-text-primary text-sm hover:bg-[#2a2a2a] group"
                                            >
                                                <div
                                                    className={`w-[16px] h-[16px] rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected
                                                        ? 'bg-text-primary border-text-primary'
                                                        : 'bg-transparent border-text-secondary group-hover:border-text-primary'
                                                        }`}
                                                >
                                                    {isSelected && <Check size={10} className="text-bg-primary" strokeWidth={3} />}
                                                </div>
                                                <option.icon
                                                    size={14}
                                                    className={`transition-colors ${isSelected ? option.color : 'text-text-tertiary'} ${option.hover}`}
                                                />
                                                <span className="flex-1">{option.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );

                    case 'viewerType':
                        return (
                            <div className="flex flex-col h-full overflow-hidden">
                                <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                                    {/**
                                     * BUSINESS LOGIC: Viewer Type Classification
                                     * Categories are based on Average View Duration as a percentage of Total Video Duration:
                                     * - Bouncer: < 1%
                                     * - Trialist: 1.1% – 10%
                                     * - Explorer: 10.1% – 30%
                                     * - Interested: 30.1% – 60%
                                     * - Core: 60.1% – 95%
                                     * - Passive: > 95%
                                     */}
                                    {[
                                        { id: 'bouncer', label: 'Bouncer (< 1%)', icon: ZapOff, color: 'text-red-400', hover: 'group-hover:text-red-400' },
                                        { id: 'trialist', label: 'Trialist (1.1% – 10%)', icon: Zap, color: 'text-orange-400', hover: 'group-hover:text-orange-400' },
                                        { id: 'explorer', label: 'Explorer (10.1% – 30%)', icon: Compass, color: 'text-amber-400', hover: 'group-hover:text-amber-400' },
                                        { id: 'interested', label: 'Interested (30.1% – 60%)', icon: Eye, color: 'text-blue-400', hover: 'group-hover:text-blue-400' },
                                        { id: 'core', label: 'Core Audience (60.1% – 95%)', icon: Target, color: 'text-emerald-400', hover: 'group-hover:text-emerald-400' },
                                        { id: 'passive', label: 'Passive (> 95%)', icon: Coffee, color: 'text-purple-400', hover: 'group-hover:text-purple-400' },
                                        { id: 'smart_assistant', label: 'Set by Smart Assistant', icon: Wand2, color: 'text-blue-500', hover: 'group-hover:text-blue-500' },
                                        { id: 'unknown', label: 'Unset', icon: HelpCircle, color: 'text-text-tertiary', hover: 'group-hover:text-text-primary' }
                                    ].map(opt => {
                                        const currentVal = existingFilter?.value;
                                        const isSelected = Array.isArray(currentVal)
                                            ? currentVal.includes(opt.id)
                                            : currentVal === opt.id;
                                        const TypeIcon = opt.icon;

                                        return (
                                            <div
                                                key={opt.id}
                                                onClick={() => {
                                                    let newVal: string[] = Array.isArray(currentVal) ? [...currentVal] : (currentVal ? [currentVal] : []);

                                                    if (isSelected) {
                                                        newVal = newVal.filter(v => v !== opt.id);
                                                    } else {
                                                        newVal.push(opt.id);
                                                    }

                                                    if (newVal.length === 0) {
                                                        if (existingFilter) onRemoveFilter(existingFilter.id);
                                                    } else {
                                                        const label = newVal.length === 1
                                                            ? `Viewer: ${opt.label}`
                                                            : `Viewer: ${newVal.length} selected`;

                                                        onAddFilter({
                                                            type: 'viewerType',
                                                            operator: 'contains',
                                                            value: newVal,
                                                            label
                                                        });
                                                    }
                                                }}
                                                className="px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors rounded-lg text-text-primary text-sm hover:bg-[#2a2a2a] group"
                                            >
                                                <Checkbox checked={isSelected} onChange={() => { }} className="flex-shrink-0" />

                                                <TypeIcon
                                                    size={12}
                                                    className={`flex-shrink-0 transition-colors ${isSelected ? opt.color : 'text-text-tertiary'} ${opt.hover}`}
                                                />

                                                <span className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs transition-colors ${isSelected ? 'text-text-primary font-medium' : 'text-text-secondary group-hover:text-text-primary'}`}>
                                                    {opt.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );

                    case 'trafficType':
                        return (
                            <div className="flex flex-col h-full overflow-hidden">
                                <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                                    {[
                                        { id: 'autoplay', label: 'Suggested (Autoplay)', icon: Sparkles, color: 'text-purple-400', hover: 'group-hover:text-purple-400' },
                                        { id: 'user_click', label: 'User Intent (Click)', icon: MousePointerClick, color: 'text-emerald-400', hover: 'group-hover:text-emerald-400' },
                                        { id: 'smart_assistant', label: 'Set by Smart Assistant', icon: Wand2, color: 'text-blue-500', hover: 'group-hover:text-blue-500' },
                                        { id: 'unknown', label: 'Unset', icon: HelpCircle, color: 'text-text-tertiary', hover: 'group-hover:text-text-primary' }
                                    ].map(opt => {
                                        const currentVal = existingFilter?.value;
                                        const isSelected = Array.isArray(currentVal)
                                            ? currentVal.includes(opt.id)
                                            : currentVal === opt.id;
                                        const TypeIcon = opt.icon;

                                        return (
                                            <div
                                                key={opt.id}
                                                onClick={() => {
                                                    let newVal: string[] = Array.isArray(currentVal) ? [...currentVal] : (currentVal ? [currentVal] : []);

                                                    if (isSelected) {
                                                        newVal = newVal.filter(v => v !== opt.id);
                                                    } else {
                                                        newVal.push(opt.id);
                                                    }

                                                    if (newVal.length === 0) {
                                                        if (existingFilter) onRemoveFilter(existingFilter.id);
                                                    } else {
                                                        const label = newVal.length === 1
                                                            ? `Type: ${opt.label}`
                                                            : `Type: ${newVal.length} selected`;

                                                        onAddFilter({
                                                            type: 'trafficType',
                                                            operator: 'contains',
                                                            value: newVal,
                                                            label
                                                        });
                                                    }
                                                }}
                                                className="px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors rounded-lg text-text-primary text-sm hover:bg-[#2a2a2a] group"
                                            >
                                                <Checkbox checked={isSelected} onChange={() => { }} className="flex-shrink-0" />

                                                <TypeIcon
                                                    size={12}
                                                    className={`flex-shrink-0 transition-colors ${isSelected ? opt.color : 'text-text-tertiary'} ${opt.hover}`}
                                                />

                                                <span className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs transition-colors ${isSelected ? 'text-text-primary font-medium' : 'text-text-secondary group-hover:text-text-primary'}`}>
                                                    {opt.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );

                    default:
                        // Numeric Filters (Impressions, Views, CTR, AVD)
                        return (
                            <div className="animate-fade-in">
                                <FilterInputNumeric
                                    initialOperator={existingFilter?.operator || 'gte'}
                                    initialValue={isRange ? initialVal[0] : initialVal}
                                    initialMaxValue={isRange ? initialVal[1] : undefined}
                                    isDuration={activeView === 'avgViewDuration'}
                                    // Independent Hide Zero Logic - Apply Based
                                    initialIsHideZero={
                                        activeView === 'views'
                                            ? filters.some(f => f.type === 'hideZeroViews')
                                            : activeView === 'impressions'
                                                ? filters.some(f => f.type === 'hideZeroImpressions')
                                                : undefined
                                    }
                                    showHideZeroOption={activeView === 'views' || activeView === 'impressions'}
                                    metricLabel={activeView === 'views' ? 'Views' : activeView === 'impressions' ? 'Impressions' : undefined}
                                    onApply={(op, val, max, isHideZero) => {
                                        // 1. Handle Main Filter
                                        if (!isNaN(val)) {
                                            handleApplyFilter(activeView as TrafficFilterType, op, val, max);
                                        } else {
                                            // If value is clean (NaN), remove existing main filter if present
                                            const mainFilter = filters.find(f => f.type === activeView);
                                            if (mainFilter) {
                                                onRemoveFilter(mainFilter.id);
                                            }
                                        }

                                        // 2. Handle Independent Hide Zero Filter
                                        if (activeView === 'views' || activeView === 'impressions') {
                                            const hideType = activeView === 'views' ? 'hideZeroViews' : 'hideZeroImpressions';
                                            const existingHideFilter = filters.find(f => f.type === hideType);

                                            if (isHideZero && !existingHideFilter) {
                                                onAddFilter({
                                                    type: hideType as any,
                                                    operator: 'gt',
                                                    value: 0,
                                                    label: activeView === 'views' ? 'Hide 0 Views' : 'Hide 0 Impr.'
                                                });
                                            } else if (!isHideZero && existingHideFilter) {
                                                onRemoveFilter(existingHideFilter.id);
                                            }
                                        }

                                        onClose();
                                    }}
                                    onRemove={existingFilter ? () => {
                                        onRemoveFilter(existingFilter.id);
                                        onClose();
                                    } : undefined}
                                />
                            </div>
                        );
                }
            })()}
        </div>
    );
};
