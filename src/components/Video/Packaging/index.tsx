import React, { useState, useRef } from 'react';
import { ArrowUp, ArrowDown, Minus, Settings, Plus } from 'lucide-react';
import { PortalTooltip } from '../../Shared/PortalTooltip';
import type { PackagingVersion, PackagingCheckin, PackagingMetrics } from '../../../utils/youtubeApi';
import type { CTRRule } from './types';
import { CTRConfigPopup } from './components/CTRConfigPopup';
import { SmartTimeInput } from './components/SmartTimeInput';
import { VersionDetailsTooltipContent } from './components/VersionDetailsTooltip';

interface PackagingTableProps {
    history: PackagingVersion[];
    onUpdateHistory: (newHistory: PackagingVersion[]) => void;
    onAddCheckin: (versionNumber: number) => void;
}

export const PackagingTable: React.FC<PackagingTableProps> = ({ history, onUpdateHistory, onAddCheckin }) => {
    const [editingCell, setEditingCell] = useState<{ id: string, field: string } | null>(null);

    // CTR Configuration State
    const [ctrRules, setCtrRules] = useState<CTRRule[]>([]);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const configAnchorRef = useRef<HTMLButtonElement>(null);

    const formatTime = (seconds?: number) => {
        if (seconds === undefined) return '-';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m >= 60) {
            const h = Math.floor(m / 60);
            const remM = m % 60;
            return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatDiff = (current: number, previous: number, isTime = false) => {
        const diff = current - previous;
        if (diff === 0) return null;
        const isPositive = diff > 0;
        const Icon = isPositive ? ArrowUp : ArrowDown;
        const color = isPositive ? 'text-[#4ADE80]' : 'text-[#EF4444]'; // Green or Red

        let diffText = Math.abs(diff).toString();
        if (isTime) {
            diffText = formatTime(Math.abs(diff));
        } else if (!Number.isInteger(diff)) {
            diffText = Math.abs(diff).toFixed(1);
        }

        return (
            <span className={`flex items-center text-[9px] ${color}`}>
                <Icon size={10} className="mr-0.5" />
                {diffText}
            </span>
        );
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTimeStr = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const getCTRColor = (value: number) => {
        for (const rule of ctrRules) {
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
        return undefined; // Default color
    };

    const renderCell = (checkin: PackagingCheckin, field: keyof PackagingMetrics, previousCheckin?: PackagingCheckin) => {
        const value = checkin.metrics[field];
        const isEditing = editingCell?.id === checkin.id && editingCell?.field === field;

        if (isEditing) {
            const isAvd = field === 'avdSeconds';

            return (
                <div className="flex justify-center">
                    {isAvd ? (
                        <SmartTimeInput
                            value={value}
                            onSave={(newValue) => {
                                const newHistory = [...history];
                                const version = newHistory.find(v => v.checkins.some(c => c.id === checkin.id));
                                const targetCheckin = version?.checkins.find(c => c.id === checkin.id);
                                if (targetCheckin) {
                                    targetCheckin.metrics[field] = newValue;
                                    onUpdateHistory(newHistory);
                                }
                                setEditingCell(null);
                            }}
                            onCancel={() => setEditingCell(null)}
                        />
                    ) : (
                        <input
                            autoFocus
                            type="number"
                            className="w-16 bg-[#1F1F1F] text-white text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none rounded text-xs"
                            defaultValue={value}
                            onBlur={(e) => {
                                const newValue = Number(e.target.value);
                                const newHistory = [...history];
                                const version = newHistory.find(v => v.checkins.some(c => c.id === checkin.id));
                                const targetCheckin = version?.checkins.find(c => c.id === checkin.id);
                                if (targetCheckin) {
                                    targetCheckin.metrics[field] = newValue;
                                    onUpdateHistory(newHistory);
                                }
                                setEditingCell(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const target = e.currentTarget;
                                    const newValue = Number(target.value);

                                    const newHistory = [...history];
                                    const version = newHistory.find(v => v.checkins.some(c => c.id === checkin.id));
                                    const targetCheckin = version?.checkins.find(c => c.id === checkin.id);
                                    if (targetCheckin) {
                                        targetCheckin.metrics[field] = newValue;
                                        onUpdateHistory(newHistory);
                                    }
                                    setEditingCell(null);
                                }
                            }}
                        />
                    )}
                </div>
            );
        }

        if (value === undefined) {
            return (
                <div className="flex justify-center">
                    <button
                        onClick={() => setEditingCell({ id: checkin.id, field })}
                        className="text-[#424242] hover:text-white/50 transition-colors"
                    >
                        <Minus size={12} />
                    </button>
                </div>
            );
        }

        let displayValue: string | number = value;
        if (typeof value === 'number' && field !== 'avdSeconds') {
            displayValue = value.toLocaleString();
        }
        if (field === 'ctr' || field === 'avdPercentage') displayValue = `${value}%`;
        if (field === 'avdSeconds') displayValue = formatTime(value);

        // Apply CTR Color Rules
        let customColorStyle = {};
        if (field === 'ctr' && typeof value === 'number') {
            const color = getCTRColor(value);
            if (color) {
                customColorStyle = { color: color };
            }
        }

        return (
            <div className="flex items-center justify-center">
                <span
                    className="relative inline-block cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded transition-colors text-xs text-white font-medium group/cell"
                    style={customColorStyle}
                    onClick={() => setEditingCell({ id: checkin.id, field })}
                >
                    {displayValue}
                    {previousCheckin && previousCheckin.metrics[field] !== undefined && field !== 'impressions' && field !== 'views' && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1 whitespace-nowrap">
                            {formatDiff(value, previousCheckin.metrics[field]!, field === 'avdSeconds')}
                        </div>
                    )}
                </span>
            </div>
        );
    };

    return (
        <div className="w-full overflow-hidden rounded-xl bg-bg-secondary">
            <CTRConfigPopup
                isOpen={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
                rules={ctrRules}
                onSave={setCtrRules}
                anchorRef={configAnchorRef as React.RefObject<HTMLElement>}
            />
            {/* Header */}
            <div className="grid grid-cols-6 gap-4 px-6 py-3 bg-[#1F1F1F] border-b border-white/5">
                <div className="text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider">Version</div>
                <div className="text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider text-center">Impressions</div>
                <div className="flex items-center justify-center gap-1">
                    <div className="text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider text-center">CTR</div>
                    <button
                        ref={configAnchorRef}
                        onClick={() => setIsConfigOpen(!isConfigOpen)}
                        className={`text-[#5A5A5A] hover:text-white transition-colors ${isConfigOpen ? 'text-white' : ''}`}
                    >
                        <Settings size={14} />
                    </button>
                </div>
                <div className="text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider text-center">Views</div>
                <div className="text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider text-center">AVD</div>
                <div className="text-[10px] font-bold text-[#5A5A5A] uppercase tracking-wider text-center">Date</div>
            </div>

            {/* Body */}
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                {history.length === 0 ? (
                    <div className="py-4 text-[#555] text-center">
                        <span className="text-xs">No packaging history yet.</span>
                    </div>
                ) : (
                    history.map((version, vIndex) => (
                        <React.Fragment key={version.versionNumber}>
                            {/* Version Rows */}
                            {version.checkins.map((checkin, cIndex) => {
                                const previousCheckin = cIndex > 0 ? version.checkins[cIndex - 1] : undefined;

                                return (
                                    <div key={checkin.id} className="grid grid-cols-6 gap-4 px-6 py-2 items-center odd:bg-white/[0.02] even:bg-transparent hover:bg-white/[0.04] transition-colors">
                                        <div className="flex items-center gap-2">
                                            {version.configurationSnapshot ? (
                                                <PortalTooltip
                                                    content={<VersionDetailsTooltipContent snapshot={version.configurationSnapshot} />}
                                                    className="max-w-[300px] w-[300px]"
                                                    align="left"
                                                >
                                                    <span className="text-xs font-medium text-white cursor-help border-b border-dashed border-white/20 hover:border-white/50 transition-colors">
                                                        v.{version.versionNumber}
                                                    </span>
                                                </PortalTooltip>
                                            ) : (
                                                <span className="text-xs font-medium text-white">v.{version.versionNumber}</span>
                                            )}
                                        </div>

                                        {renderCell(checkin, 'impressions', previousCheckin)}
                                        {renderCell(checkin, 'ctr', previousCheckin)}
                                        {renderCell(checkin, 'views', previousCheckin)}
                                        {renderCell(checkin, 'avdSeconds', previousCheckin)}

                                        <div className="flex flex-col items-end justify-center pr-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-[#DDD] font-medium">{formatDate(checkin.date)}</span>
                                            </div>
                                            <span className="text-[10px] text-[#555]">{formatTimeStr(checkin.date)}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Transition Separator (if not last version) */}
                            {vIndex < history.length - 1 && (
                                <div className="relative h-8 flex items-center justify-center my-1">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-white/5"></div>
                                    </div>
                                    <div className="relative bg-bg-secondary px-4 text-[10px] text-[#555] font-mono">
                                        {formatDate(version.checkins[version.checkins.length - 1].date)}
                                    </div>
                                </div>
                            )}

                            {/* Add Check-in Button (Only for the latest version) */}
                            {vIndex === history.length - 1 && (
                                <div className="px-6 py-4 flex justify-end">
                                    <button
                                        onClick={() => onAddCheckin(version.versionNumber)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-xs text-[#AAAAAA] hover:text-white rounded transition-colors border border-white/10 hover:border-white/20"
                                    >
                                        <Plus size={12} />
                                        Add Check-in
                                    </button>
                                </div>
                            )}
                        </React.Fragment>
                    ))
                )}
            </div>
        </div>
    );
};
