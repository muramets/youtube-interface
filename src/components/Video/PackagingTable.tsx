import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, Minus, Image as ImageIcon, Type, AlignLeft, Tag, Copy, Check, Settings, Plus, Trash2, X, ChevronDown } from 'lucide-react';
import { PortalTooltip } from '../Shared/PortalTooltip';

interface MetricCheckin {
    id: string;
    date: number;
    type: 'creation' | 'update' | 'final';
    metrics: {
        impressions?: number;
        ctr?: number;
        views?: number;
        avdSeconds?: number;
        avdPercentage?: number;
    };
}

interface PackagingSnapshot {
    title: string;
    description: string;
    tags: string[];
    coverImage: string;
    abTestVariants?: string[];
}

interface PackagingVersion {
    versionNumber: number;
    checkins: MetricCheckin[];
    snapshot?: PackagingSnapshot;
}

interface CTRRule {
    id: string;
    operator: '<' | '>' | '<=' | '>=' | 'between';
    value: number;
    maxValue?: number; // For 'between' operator
    color: string;
}

// Mock Data
const MOCK_HISTORY: PackagingVersion[] = [
    {
        versionNumber: 1,
        snapshot: {
            title: "My Amazing Video Title v1",
            description: "This is the description for the first version of the video. It contains keywords and explains the content.",
            tags: ["gaming", "review", "2025"],
            coverImage: "https://picsum.photos/seed/v1/320/180",
            abTestVariants: ["https://picsum.photos/seed/v1-ab/320/180"]
        },
        checkins: [
            {
                id: 'v1-c1',
                date: Date.now() - 86400000 * 3, // 3 days ago
                type: 'creation',
                metrics: { impressions: 1000, ctr: 4.5, views: 500, avdSeconds: 60, avdPercentage: 40 }
            },
            {
                id: 'v1-c2',
                date: Date.now() - 86400000 * 2, // 2 days ago
                type: 'update',
                metrics: { impressions: 1500, ctr: 5.0, views: 750, avdSeconds: 65, avdPercentage: 42 }
            },
            {
                id: 'v1-final',
                date: Date.now() - 86400000 * 1, // 1 day ago
                type: 'final',
                metrics: { impressions: 2000, ctr: 4.8, views: 900, avdSeconds: 70, avdPercentage: 45 }
            }
        ]
    },
    {
        versionNumber: 2,
        snapshot: {
            title: "My Amazing Video Title v2 - UPDATED",
            description: "Updated description for better SEO and click-through rate.",
            tags: ["gaming", "review", "2025", "updated"],
            coverImage: "https://picsum.photos/seed/v2/320/180",
            abTestVariants: []
        },
        checkins: [
            {
                id: 'v2-c1',
                date: Date.now(),
                type: 'creation',
                metrics: {} // Empty for new version
            }
        ]
    }
];

const VersionDetailsTooltipContent: React.FC<{ snapshot: PackagingSnapshot }> = ({ snapshot }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const hasAbTest = snapshot.abTestVariants && snapshot.abTestVariants.length > 0;

    return (
        <div className="flex flex-col gap-3 w-full">
            {/* Title */}
            <div className="flex gap-2">
                <Type size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div className="text-xs font-medium text-white">{snapshot.title}</div>
            </div>

            {/* Description */}
            <div className="flex gap-2">
                <AlignLeft size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div
                    className={`text-[10px] text-[#CCCCCC] cursor-pointer hover:text-white transition-colors ${isExpanded ? '' : 'line-clamp-2'}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {snapshot.description}
                </div>
            </div>

            {/* Tags */}
            <div className="flex gap-2 relative">
                <Tag size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div className="flex flex-wrap gap-1 pr-6">
                    {snapshot.tags.map(tag => (
                        <span key={tag} className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-[#DDDDDD]">
                            #{tag}
                        </span>
                    ))}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        const cleanTags = snapshot.tags.map(tag => tag.replace(/^#/, ''));
                        navigator.clipboard.writeText(cleanTags.join(', '));
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                    }}
                    className="absolute top-0.5 right-0 text-[#AAAAAA] hover:text-white transition-colors"
                    title="Copy all tags"
                >
                    {isCopied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                </button>
            </div>

            {/* Images */}
            <div className="flex gap-2 mt-1">
                <ImageIcon size={14} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {/* Main / Variant A */}
                    <div className="shrink-0 flex flex-col gap-1">
                        <span className="text-[9px] text-[#AAAAAA]">{hasAbTest ? 'Variant A' : 'Main'}</span>
                        <img src={snapshot.coverImage} alt="Cover" className="w-24 aspect-video object-cover rounded border border-white/10" />
                    </div>
                    {/* AB Variants (B, C...) */}
                    {snapshot.abTestVariants?.map((url, i) => (
                        <div key={i} className="shrink-0 flex flex-col gap-1">
                            <span className="text-[9px] text-[#AAAAAA]">Variant {String.fromCharCode(66 + i)}</span>
                            <img src={url} alt={`Variant ${i}`} className="w-24 aspect-video object-cover rounded border border-white/10 opacity-80" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const SmartTimeInput: React.FC<{
    value: number | undefined;
    onSave: (newValue: number) => void;
    onCancel: () => void;
}> = ({ value, onSave, onCancel }) => {
    const formatInitialValue = (seconds?: number) => {
        if (seconds === undefined) return '';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        // If hours exist, we might want to support that, but for now let's stick to the requested format
        // Actually, let's use the same logic as the display formatter but maybe simplified
        if (m >= 60) {
            const h = Math.floor(m / 60);
            const remM = m % 60;
            return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const [inputValue, setInputValue] = useState(formatInitialValue(value));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = e.target.value.replace(/[^\d]/g, '');

        // Limit length to prevent overflow (e.g. HH:MM:SS is max 6 digits usually)
        if (raw.length > 6) raw = raw.slice(0, 6);

        let formatted = raw;
        if (raw.length > 2 && raw.length <= 4) {
            // MM:SS
            formatted = `${raw.slice(0, -2)}:${raw.slice(-2)}`;
        } else if (raw.length > 4) {
            // H:MM:SS
            formatted = `${raw.slice(0, -4)}:${raw.slice(-4, -2)}:${raw.slice(-2)}`;
        }

        setInputValue(formatted);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            save();
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    const save = () => {
        // Parse the formatted string back to seconds
        const parts = inputValue.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) {
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) {
            seconds = parts[0];
        }
        onSave(seconds);
    };

    return (
        <input
            autoFocus
            type="text"
            className="w-16 bg-[#1F1F1F] text-white text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none rounded text-xs"
            value={inputValue}
            onChange={handleChange}
            onBlur={save}
            onKeyDown={handleKeyDown}
        />
    );
};

const CTRConfigPopup: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    initialRules: CTRRule[];
    onSave: (rules: CTRRule[]) => void;
    anchorRef: React.RefObject<HTMLElement | null>;
}> = ({ isOpen, onClose, initialRules, onSave, anchorRef }) => {
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const [localRules, setLocalRules] = useState<CTRRule[]>([]);
    const popupRef = useRef<HTMLDivElement>(null);

    // Initialize local state when opening
    useEffect(() => {
        if (isOpen) {
            setLocalRules(JSON.parse(JSON.stringify(initialRules)));
        }
    }, [isOpen, initialRules]);

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
            if (popupRef.current && !popupRef.current.contains(event.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
                onClose(); // Close without saving
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, anchorRef]);

    if (!isOpen || !position) return null;

    const COLORS = [
        '#EF4444', // Red
        '#F97316', // Orange
        '#EAB308', // Yellow
        '#22C55E', // Green
        '#3B82F6', // Blue
        '#A855F7', // Purple
    ];

    const addRule = () => {
        setLocalRules([
            ...localRules,
            { id: crypto.randomUUID(), operator: '<', value: 5, color: '#EF4444' }
        ]);
    };

    const updateRule = (id: string, updates: Partial<CTRRule>) => {
        setLocalRules(localRules.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const removeRule = (id: string) => {
        setLocalRules(localRules.filter(r => r.id !== id));
    };

    const handleSave = () => {
        onSave(localRules);
        onClose();
    };

    return createPortal(
        <div
            ref={popupRef}
            style={{ top: position.top, left: position.left }}
            className="fixed z-[9999] w-[340px] bg-[#1F1F1F] border border-white/10 rounded-xl shadow-2xl p-4 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">CTR Color Rules</span>
                <button onClick={onClose} className="text-[#AAAAAA] hover:text-white transition-colors">
                    <X size={14} />
                </button>
            </div>

            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                {localRules.length === 0 && (
                    <div className="text-center py-4 text-[#555] text-xs italic">
                        No rules configured.
                    </div>
                )}
                {localRules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-2 bg-black/20 p-2 rounded-lg border border-white/5">
                        {/* Operator */}
                        <div className="relative group shrink-0">
                            <select
                                value={rule.operator}
                                onChange={(e) => updateRule(rule.id, { operator: e.target.value as CTRRule['operator'] })}
                                className="w-16 bg-[#2A2A2A] text-white text-xs rounded px-1 py-1 appearance-none focus:outline-none cursor-pointer hover:bg-[#333] transition-colors text-center"
                            >
                                <option value="<">&lt;</option>
                                <option value=">">&gt;</option>
                                <option value="<=">&le;</option>
                                <option value=">=">&ge;</option>
                                <option value="between">Range</option>
                            </select>
                            <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-[#AAAAAA] pointer-events-none" />
                        </div>

                        {/* Value(s) */}
                        {rule.operator === 'between' ? (
                            <div className="flex items-center gap-1">
                                <div className="relative flex items-center">
                                    <input
                                        type="text"
                                        value={rule.value}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^\d.]/g, '');
                                            updateRule(rule.id, { value: Number(val) });
                                        }}
                                        className="w-10 bg-[#2A2A2A] text-white text-xs rounded px-1 py-1 focus:outline-none text-center"
                                    />
                                </div>
                                <span className="text-[9px] text-[#555]">-</span>
                                <div className="relative flex items-center">
                                    <input
                                        type="text"
                                        value={rule.maxValue || ''} // Use empty string for undefined to avoid controlled component warning
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^\d.]/g, '');
                                            updateRule(rule.id, { maxValue: Number(val) });
                                        }}
                                        className="w-10 bg-[#2A2A2A] text-white text-xs rounded px-1 py-1 focus:outline-none text-center"
                                    />
                                </div>
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
                                    className="w-12 bg-[#2A2A2A] text-white text-xs rounded px-2 py-1 focus:outline-none text-center"
                                />
                                <span className="absolute right-1 text-[9px] text-[#555] pointer-events-none">%</span>
                            </div>
                        )}

                        {/* Color Picker */}
                        <div className="flex gap-1 flex-1 justify-center flex-wrap">
                            {COLORS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => updateRule(rule.id, { color })}
                                    className={`w-3.5 h-3.5 rounded-full transition-transform hover:scale-110 ${rule.color === color ? 'ring-2 ring-white scale-110' : 'opacity-40 hover:opacity-100'}`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>

                        {/* Delete */}
                        <button
                            onClick={() => removeRule(rule.id)}
                            className="text-[#555] hover:text-red-500 transition-colors p-1 shrink-0"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="flex gap-2 mt-2">
                <button
                    onClick={addRule}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white/5 hover:bg-white/10 text-[10px] text-[#AAAAAA] hover:text-white rounded transition-colors border border-dashed border-white/10 hover:border-white/20"
                >
                    <Plus size={10} />
                    Add Rule
                </button>
                <button
                    onClick={handleSave}
                    className="px-4 py-1.5 bg-white text-black text-[10px] font-bold rounded hover:bg-gray-200 transition-colors"
                >
                    Save
                </button>
            </div>
        </div>,
        document.body
    );
};

export const PackagingTable: React.FC = () => {
    const [history, setHistory] = useState<PackagingVersion[]>(MOCK_HISTORY);
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

    const renderCell = (checkin: MetricCheckin, field: keyof typeof checkin.metrics, previousCheckin?: MetricCheckin) => {
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
                                    setHistory(newHistory);
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
                                    setHistory(newHistory);
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
                                        setHistory(newHistory);
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
                initialRules={ctrRules}
                onSave={setCtrRules}
                anchorRef={configAnchorRef}
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
                {history.map((version, vIndex) => (
                    <React.Fragment key={version.versionNumber}>
                        {/* Version Rows */}
                        {version.checkins.map((checkin, cIndex) => {
                            const previousCheckin = cIndex > 0 ? version.checkins[cIndex - 1] : undefined;

                            return (
                                <div key={checkin.id} className="grid grid-cols-6 gap-4 px-6 py-2 items-center odd:bg-white/[0.02] even:bg-transparent hover:bg-white/[0.04] transition-colors">
                                    <div className="flex items-center gap-2">
                                        {version.snapshot ? (
                                            <PortalTooltip
                                                content={<VersionDetailsTooltipContent snapshot={version.snapshot} />}
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

                                        {checkin.type === 'creation' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#333] text-[#888]">Start</span>}
                                        {checkin.type === 'final' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white">Final</span>}
                                    </div>

                                    {renderCell(checkin, 'impressions', previousCheckin)}
                                    {renderCell(checkin, 'ctr', previousCheckin)}
                                    {renderCell(checkin, 'views', previousCheckin)}
                                    {renderCell(checkin, 'avdSeconds', previousCheckin)}

                                    <div className="flex flex-col items-end justify-center pr-2">
                                        <span className="text-xs text-[#DDD] font-medium">{formatDate(checkin.date)}</span>
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
                            <div className="px-6 py-2">
                                <button
                                    className="flex items-center text-xs text-[#555] hover:text-white transition-colors group ml-auto"
                                >
                                    <span className="flex items-center justify-center w-4 h-4 rounded-full border border-[#555] group-hover:border-white mr-2 text-[10px]">+</span>
                                    Add Check-in
                                </button>
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};
