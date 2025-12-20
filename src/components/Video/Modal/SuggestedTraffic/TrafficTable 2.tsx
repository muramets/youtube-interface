import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowUpDown, Settings, Check } from 'lucide-react';
import type { TrafficSource, TrafficGroup } from '../../../../types/traffic';
import { VideoTooltip } from './VideoTooltip';
import { CTRConfigPopup } from '../../Packaging/components/CTRConfigPopup';
import type { CTRRule } from '../../Packaging/types';
import { PortalTooltip } from '../../../Shared/PortalTooltip';

interface TrafficTableProps {
    data: TrafficSource[];
    totalRow?: TrafficSource;
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onToggleAll: (ids: string[]) => void;
    className?: string;
    groups?: TrafficGroup[];
    onAddToGroup?: (groupId: string, videoIds: string[]) => void;
    packagingCtrRules?: CTRRule[];
}

type SortField = 'impressions' | 'ctr' | 'views' | 'avgViewDuration' | 'watchTimeHours';
type SortDirection = 'asc' | 'desc';

const getCTRColor = (value: number, rules: CTRRule[]) => {
    for (const rule of rules) {
        switch (rule.operator) {
            case '<': if (value < rule.value) return rule.color; break;
            case '>': if (value > rule.value) return rule.color; break;
            case '<=': if (value <= rule.value) return rule.color; break;
            case '>=': if (value >= rule.value) return rule.color; break;
            case 'between':
                if (rule.maxValue !== undefined && value >= rule.value && value <= rule.maxValue) {
                    return rule.color;
                }
                break;
        }
    }
    return undefined;
};

const CustomCheckbox = ({ checked, indeterminate, onChange, className = '' }: { checked: boolean, indeterminate?: boolean, onChange: () => void, className?: string }) => (
    <div
        onClick={(e) => {
            e.stopPropagation();
            onChange();
        }}
        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${checked || indeterminate
            ? 'bg-text-primary border-text-primary'
            : 'border-text-secondary hover:border-text-primary bg-transparent'
            } ${className}`}
    >
        {checked && <Check size={10} className="text-bg-primary" strokeWidth={3} />}
        {indeterminate && !checked && <div className="w-2 h-0.5 bg-bg-primary rounded-full" />}
    </div>
);

interface TrafficTableRowProps {
    item: TrafficSource;
    isSelected: boolean;
    onToggleSelection: (id: string) => void;
    groups?: TrafficGroup[];
    onAddToGroup?: (groupId: string, videoIds: string[]) => void;
    ctrRules: CTRRule[];
}

const TrafficTableRow = React.memo(({ item, isSelected, onToggleSelection, groups, onAddToGroup, ctrRules }: TrafficTableRowProps) => {
    const [hoveredCheckbox, setHoveredCheckbox] = useState<{ id: string, element: HTMLElement } | null>(null);
    const ctrColor = getCTRColor(item.ctr, ctrRules);

    return (
        <div
            className={`
                grid grid-cols-[40px_minmax(200px,1fr)_100px_80px_100px_120px_120px] gap-4 px-4 h-12 items-center
                border-b border-white/5 last:border-0
                transition-colors cursor-pointer
                ${isSelected ? 'bg-white/[0.08]' : 'odd:bg-white/[0.02] even:bg-transparent hover:bg-white/[0.04]'}
            `}
            onClick={() => onToggleSelection(item.videoId || '')}
        >
            <div
                className="flex items-center justify-center relative"
                onMouseEnter={(e) => setHoveredCheckbox({ id: item.videoId || '', element: e.currentTarget })}
                onMouseLeave={() => setHoveredCheckbox(null)}
            >
                <CustomCheckbox
                    checked={isSelected}
                    onChange={() => onToggleSelection(item.videoId || '')}
                />
                {hoveredCheckbox?.id === item.videoId && isSelected && groups && groups.length > 0 && (
                    <PortalTooltip
                        content={
                            <div className="w-48 bg-modal-surface border border-white/10 rounded-lg shadow-xl overflow-hidden py-1">
                                <div className="px-3 py-2 text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider border-b border-white/5 mb-1">
                                    Add to Group
                                </div>
                                {groups.map(g => (
                                    <button
                                        key={g.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onAddToGroup && item.videoId) {
                                                onAddToGroup(g.id, [item.videoId]);
                                            }
                                        }}
                                        className="w-full text-left px-4 py-2 text-xs text-text-secondary hover:text-white hover:bg-white/5 flex items-center gap-2"
                                    >
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                                        {g.name}
                                    </button>
                                ))}
                            </div>
                        }
                        align="left"
                    >
                        <div className="absolute inset-0 z-10" />
                    </PortalTooltip>
                )}
            </div>
            <div className="min-w-0">
                <VideoTooltip source={item}>
                    <div className="text-sm text-text-primary truncate cursor-help hover:text-white transition-colors">
                        {item.sourceTitle}
                    </div>
                </VideoTooltip>
            </div>
            <div className="text-center text-sm text-text-secondary font-mono">{item.impressions.toLocaleString()}</div>
            <div className="text-center text-sm font-mono" style={{ color: ctrColor || '#AAAAAA' }}>{item.ctr.toFixed(1)}%</div>
            <div className="text-center text-sm text-text-secondary font-mono">{item.views.toLocaleString()}</div>
            <div className="text-center text-sm text-text-secondary font-mono">{item.avgViewDuration}</div>
            <div className="text-center text-sm text-text-secondary font-mono">{item.watchTimeHours.toFixed(1)}</div>
        </div>
    );
});

export const TrafficTable: React.FC<TrafficTableProps> = ({
    data,
    totalRow,
    selectedIds,
    onToggleSelection,
    onToggleAll,
    groups,
    onAddToGroup,
    className,
    packagingCtrRules = []
}) => {

    const [sortField, setSortField] = useState<SortField>('impressions');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // CTR Configuration State
    const [ctrRules, setCtrRules] = useState<CTRRule[]>([]);
    const [deletedRuleIds, setDeletedRuleIds] = useState<Set<string>>(new Set());
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const configAnchorRef = useRef<HTMLButtonElement>(null);

    // Sync rules from Packaging
    useEffect(() => {
        if (packagingCtrRules.length > 0) {
            setCtrRules(prev => {
                const currentIds = new Set(prev.map(r => r.id));
                const newRules = packagingCtrRules.filter(r =>
                    !currentIds.has(r.id) && !deletedRuleIds.has(r.id)
                );

                if (newRules.length > 0) {
                    return [...prev, ...newRules];
                }
                return prev;
            });
        }
    }, [packagingCtrRules, deletedRuleIds]);

    const handleSaveRules = (newRules: CTRRule[]) => {
        // Detect deletions
        const newIds = new Set(newRules.map(r => r.id));
        const deleted = ctrRules.filter(r => !newIds.has(r.id));

        if (deleted.length > 0) {
            setDeletedRuleIds(prev => {
                const next = new Set(prev);
                deleted.forEach(d => next.add(d.id));
                return next;
            });
        }

        setCtrRules(newRules);
    };

    // Group Popup State



    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => {
            let valA: number | string = a[sortField];
            let valB: number | string = b[sortField];

            if (sortField === 'avgViewDuration') {
                const parseDuration = (d: string) => {
                    const parts = d.split(':').map(Number);
                    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                    if (parts.length === 2) return parts[0] * 60 + parts[1];
                    return 0;
                };
                valA = parseDuration(a.avgViewDuration);
                valB = parseDuration(b.avgViewDuration);
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, sortField, sortDirection]);

    const allSelected = data.length > 0 && data.every(item => item.videoId && selectedIds.has(item.videoId));
    const isIndeterminate = data.some(item => item.videoId && selectedIds.has(item.videoId)) && !allSelected;

    const handleSelectAll = () => {
        const ids = data.map(d => d.videoId).filter((id): id is string => id !== null);
        onToggleAll(ids);
    };



    const SortIcon = ({ direction }: { direction: SortDirection }) => (
        <div className="ml-1 p-0.5 rounded text-text-primary">
            <ArrowUpDown size={12} className={direction === 'asc' ? 'rotate-180' : ''} />
        </div>
    );



    return (
        <div className={`w-full h-full flex flex-col overflow-hidden rounded-xl bg-bg-secondary ${className}`}>
            <CTRConfigPopup
                isOpen={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
                rules={ctrRules}
                onSave={handleSaveRules}
                anchorRef={configAnchorRef as React.RefObject<HTMLElement>}
            />

            {/* Table Header */}
            <div className="grid grid-cols-[40px_minmax(200px,1fr)_100px_80px_100px_120px_120px] gap-4 px-4 py-3 bg-[#1F1F1F] border-b border-white/5 text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider flex-shrink-0">
                <div className="flex items-center justify-center">
                    <CustomCheckbox
                        checked={allSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleSelectAll}
                    />
                </div>
                <div className="truncate">Source Title</div>
                <div className="text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1 truncate" onClick={() => handleSort('impressions')}>
                    <span className="truncate">Impressions</span>
                    {sortField === 'impressions' && <SortIcon direction={sortDirection} />}
                </div>
                <div className="text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1 truncate" onClick={() => handleSort('ctr')}>
                    <span className="truncate">CTR</span>
                    {sortField === 'ctr' && <SortIcon direction={sortDirection} />}
                    <button
                        ref={configAnchorRef}
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsConfigOpen(!isConfigOpen);
                        }}
                        className={`ml-1 text-[#5A5A5A] hover:text-white transition-colors ${isConfigOpen ? 'text-white' : ''} flex-shrink-0`}
                    >
                        <Settings size={12} />
                    </button>
                </div>
                <div className="text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1 truncate" onClick={() => handleSort('views')}>
                    <span className="truncate">Views</span>
                    {sortField === 'views' && <SortIcon direction={sortDirection} />}
                </div>
                <div className="text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1 truncate" onClick={() => handleSort('avgViewDuration')}>
                    <span className="truncate">Avg Duration</span>
                    {sortField === 'avgViewDuration' && <SortIcon direction={sortDirection} />}
                </div>
                <div className="text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1 truncate" onClick={() => handleSort('watchTimeHours')}>
                    <span className="truncate">Watch Time (h)</span>
                    {sortField === 'watchTimeHours' && <SortIcon direction={sortDirection} />}
                </div>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {/* Total Row */}
                {totalRow && (
                    <div className="grid grid-cols-[40px_minmax(200px,1fr)_100px_80px_100px_120px_120px] gap-4 px-4 h-10 items-center bg-white/5 border-b border-white/5 text-sm font-medium text-white">
                        <div className="text-center text-[#5A5A5A]">Total</div>
                        <div></div>
                        <div className="text-center font-mono">{totalRow.impressions.toLocaleString()}</div>
                        <div className="text-center font-mono">{totalRow.ctr.toFixed(1)}%</div>
                        <div className="text-center font-mono">{totalRow.views.toLocaleString()}</div>
                        <div className="text-center font-mono">{totalRow.avgViewDuration}</div>
                        <div className="text-center font-mono">{totalRow.watchTimeHours.toFixed(1)}</div>
                    </div>
                )}

                {sortedData.map((item) => (
                    <TrafficTableRow
                        key={item.videoId || Math.random().toString()}
                        item={item}
                        isSelected={selectedIds.has(item.videoId || '')}
                        onToggleSelection={onToggleSelection}
                        groups={groups}
                        onAddToGroup={onAddToGroup}
                        ctrRules={ctrRules}
                    />
                ))}

                {sortedData.length === 0 && !totalRow && (
                    <div className="px-4 py-8 text-center text-text-secondary">
                        No traffic data available.
                    </div>
                )}
            </div>
        </div>
    );
};
