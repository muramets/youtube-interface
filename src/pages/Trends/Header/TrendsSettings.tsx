import React, { useState } from 'react';
import { Settings, Maximize2, Check, ChevronLeft, X } from 'lucide-react';
import type { TimelineConfig } from '../../../core/types/trends';
import { ScalingTooltip } from './ScalingTooltip';
import { Dropdown } from '../../../components/Shared/Dropdown';
import { SegmentedControl } from '../../../components/ui/molecules/SegmentedControl';

interface TrendsSettingsProps {
    timelineConfig: TimelineConfig;
    setTimelineConfig: (config: Partial<TimelineConfig>) => void;
    availableMinDate?: number;
    availableMaxDate?: number;
}

export const TrendsSettings: React.FC<TrendsSettingsProps> = ({
    timelineConfig,
    setTimelineConfig,
    availableMinDate,
    availableMaxDate
}) => {
    // Calculate safe maximum window (1/3 of total duration)
    // If undefined, default to 90 (no clamping)
    const maxSensibleDays = (availableMinDate && availableMaxDate)
        ? Math.floor(((availableMaxDate - availableMinDate) / (1000 * 60 * 60 * 24)) / 3)
        : 90;

    // Settings Dropdown State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsView, setSettingsView] = useState<'main' | 'scaling' | 'baseline'>('main');
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    // Tooltip State
    const [hoveredScalingMode, setHoveredScalingMode] = useState<'linear' | 'log' | 'sqrt' | 'percentile' | null>(null);
    const [hoveredBaselineMode, setHoveredBaselineMode] = useState<'dynamic' | 'global' | null>(null);
    const [hoveredItemRect, setHoveredItemRect] = useState<DOMRect | null>(null);

    const handleMouseEnter = (mode: string, type: 'scaling' | 'baseline', e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (type === 'scaling') {
            setHoveredScalingMode(mode as TimelineConfig['scalingMode']);
            setHoveredBaselineMode(null);
        } else {
            setHoveredBaselineMode(mode as TimelineConfig['baselineMode'] & string);
            setHoveredScalingMode(null);
        }
        setHoveredItemRect(rect);
    };

    const handleMouseLeave = () => {
        setHoveredScalingMode(null);
        setHoveredBaselineMode(null);
        setHoveredItemRect(null);
    };

    const handleClose = () => {
        setIsSettingsOpen(false);
        setTimeout(() => setSettingsView('main'), 200); // Reset on close
    };

    return (
        <div className="relative">
            <button
                ref={setAnchorEl}
                onClick={() => {
                    if (isSettingsOpen) {
                        handleClose();
                    } else {
                        setIsSettingsOpen(true);
                    }
                }}
                className={`p-2 rounded-lg transition-colors ${isSettingsOpen ? 'bg-bg-secondary text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'} `}
            >
                <Settings size={20} />
            </button>

            <Dropdown
                isOpen={isSettingsOpen}
                onClose={handleClose}
                anchorEl={anchorEl}
                width={280}
                className="text-text-primary"
            >
                {settingsView === 'main' ? (
                    <div className="py-2">
                        {/* Size Scaling Menu Item */}
                        <div
                            onClick={() => setSettingsView('scaling')}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 flex items-center justify-center">
                                    <Maximize2 size={20} />
                                </div>
                                <span className="text-sm">Scaling: {
                                    { linear: 'Linear', log: 'Logarithmic', sqrt: 'Square Root', percentile: 'Percentile' }[timelineConfig.scalingMode]
                                }</span>
                            </div>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-text-secondary"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                        </div>

                        {/* Baseline Menu Item */}
                        <div
                            onClick={() => setSettingsView('baseline')}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 flex items-center justify-center">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18" /><path d="M3 6h18" strokeDasharray="4 4" opacity="0.5" /></svg>
                                </div>
                                <span className="text-sm">Baseline: {
                                    !timelineConfig.showAverageBaseline ? 'Hidden' :
                                        (timelineConfig.baselineMode === 'dynamic' ? 'Dynamic' : 'Global')
                                }</span>
                            </div>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-text-secondary"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                        </div>
                    </div>
                ) : settingsView === 'scaling' ? (
                    /* Scaling Submenu */
                    <div className="pb-2">
                        <div className="flex items-center justify-between px-2 py-2 border-b border-[#333333] mb-2">
                            <button
                                onClick={() => setSettingsView('main')}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-bold text-text-primary">Size Scaling</span>
                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="px-4 py-2 text-xs text-text-secondary">
                            Adjust how video thumbnails are sized
                        </div>

                        <div
                            onClick={() => setTimelineConfig({ scalingMode: 'linear' })}
                            onMouseEnter={(e) => handleMouseEnter('linear', 'scaling', e)}
                            onMouseLeave={handleMouseLeave}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors relative"
                        >
                            <div className="flex flex-col">
                                <span className="text-sm text-text-primary">Linear</span>
                                <span className="text-xs text-text-secondary">Raw view counts</span>
                            </div>
                            {timelineConfig.scalingMode === 'linear' && <Check size={20} className="text-text-primary" />}
                        </div>

                        <div
                            onClick={() => setTimelineConfig({ scalingMode: 'sqrt' })}
                            onMouseEnter={(e) => handleMouseEnter('sqrt', 'scaling', e)}
                            onMouseLeave={handleMouseLeave}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors relative"
                        >
                            <div className="flex flex-col">
                                <span className="text-sm text-text-primary">Square Root</span>
                                <span className="text-xs text-text-secondary">Emphasizes top performers</span>
                            </div>
                            {timelineConfig.scalingMode === 'sqrt' && <Check size={20} className="text-text-primary" />}
                        </div>

                        <div
                            onClick={() => setTimelineConfig({ scalingMode: 'log' })}
                            onMouseEnter={(e) => handleMouseEnter('log', 'scaling', e)}
                            onMouseLeave={handleMouseLeave}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors relative"
                        >
                            <div className="flex flex-col">
                                <span className="text-sm text-text-primary">Logarithmic</span>
                                <span className="text-xs text-text-secondary">Balanced distribution</span>
                            </div>
                            {timelineConfig.scalingMode === 'log' && <Check size={20} className="text-text-primary" />}
                        </div>

                        <div className="h-px bg-border my-1 mx-4 opacity-50" />

                        <div
                            onClick={() => setTimelineConfig({ scalingMode: 'percentile' })}
                            onMouseEnter={(e) => handleMouseEnter('percentile', 'scaling', e)}
                            onMouseLeave={handleMouseLeave}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors relative"
                        >
                            <div className="flex flex-col">
                                <span className="text-sm text-text-primary">Percentile</span>
                                <span className="text-xs text-text-secondary">Rank-based sizing</span>
                            </div>
                            {timelineConfig.scalingMode === 'percentile' && <Check size={20} className="text-text-primary" />}
                        </div>
                    </div>
                ) : (
                    /* Baseline Submenu */
                    <div className="pb-2">
                        <div className="flex items-center justify-between px-2 py-2 border-b border-[#333333] mb-2">
                            <button
                                onClick={() => setSettingsView('main')}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-bold text-text-primary">Avg. Baseline</span>
                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-[#333333] rounded-full text-text-secondary hover:text-text-primary transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Master Toggle */}
                        <div
                            onClick={() => setTimelineConfig({ showAverageBaseline: !timelineConfig.showAverageBaseline })}
                            className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-hover-bg transition-colors relative"
                        >
                            <span className="text-sm text-text-primary">Show Baseline</span>
                            {/* Simple simulated switch */}
                            <div className={`w-9 h-5 rounded-full relative transition-colors ${timelineConfig.showAverageBaseline ? 'bg-text-primary' : 'bg-border'}`}>
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-bg-primary transition-all ${timelineConfig.showAverageBaseline ? 'left-5' : 'left-1'}`} />
                            </div>
                        </div>

                        <div className={`transition-all duration-300 ${!timelineConfig.showAverageBaseline ? 'opacity-30 pointer-events-none' : ''}`}>
                            <div className="h-px bg-border my-1 mx-4 opacity-50" />

                            <div className="px-4 py-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                                        Baseline Mode
                                    </span>
                                </div>
                                <SegmentedControl
                                    options={[
                                        { label: 'Dynamic', value: 'dynamic' },
                                        { label: 'Global', value: 'global' }
                                    ]}
                                    value={timelineConfig.baselineMode || 'dynamic'}
                                    onChange={(v: 'dynamic' | 'global') => setTimelineConfig({ baselineMode: v })}
                                    disabled={!timelineConfig.showAverageBaseline}
                                />
                                <div className="mt-2 text-[10px] text-text-tertiary leading-relaxed grid">
                                    <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${timelineConfig.baselineMode === 'dynamic' ? 'opacity-100' : 'opacity-0'}`}>
                                        Shows how channel performance evolves over time (rolling window)
                                    </span>
                                    <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${timelineConfig.baselineMode === 'global' ? 'opacity-100' : 'opacity-0'}`}>
                                        Single flat line representing the average views of all displayed videos
                                    </span>
                                </div>
                            </div>

                            {/* Window Size Switcher (Only visible in Dynamic mode) */}
                            <div className={`px-4 pb-3 transition-opacity duration-200 ${timelineConfig.baselineMode === 'dynamic' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                                        Rolling Window
                                    </span>
                                </div>
                                {(() => {
                                    // Smart Button Logic
                                    // 1. SafeMax: The ceiling (capped at 90)
                                    const safeMax = Math.max(1, Math.min(90, maxSensibleDays));
                                    const safeFast = Math.min(7, safeMax);
                                    const safeMid = safeMax === 90 ? 30 : Math.round((safeFast + safeMax) / 2);

                                    const options = [
                                        { label: `${safeFast}d`, value: safeFast, disabled: safeMax < safeFast },
                                        { label: `${safeMid}d`, value: safeMid, disabled: safeMax < safeMid },
                                        { label: `${safeMax}d`, value: safeMax, disabled: false }
                                    ];

                                    // Auto-select minimum (safeFast) if current value is not available
                                    const currentValue = timelineConfig.baselineWindowSize || 30;
                                    const isValueAvailable = options.some(o => o.value === currentValue && !o.disabled);
                                    const effectiveValue = isValueAvailable ? currentValue : safeFast;

                                    return (
                                        <SegmentedControl
                                            options={options}
                                            value={effectiveValue}
                                            onChange={(v) => setTimelineConfig({ baselineWindowSize: v })}
                                            disabled={!timelineConfig.showAverageBaseline || timelineConfig.baselineMode !== 'dynamic'}
                                        />
                                    )
                                })()}
                                <div className="mt-2 px-1 text-[10px] text-text-tertiary">
                                    {(timelineConfig.baselineWindowSize || 30) === 7 ? 'High sensitivity. Shows short-term hype.' :
                                        (timelineConfig.baselineWindowSize || 30) === 90 ? `Low sensitivity. ${maxSensibleDays < 90 ? `Limited by data (max ${Math.max(1, Math.min(90, maxSensibleDays))}d).` : 'Shows long-term stability.'}` :
                                            'Balanced. Midpoint smoothing.'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Dropdown>

            {/* Tooltips */}
            {isSettingsOpen && hoveredScalingMode === 'linear' && (
                <ScalingTooltip
                    title="Linear Scaling"
                    description="The raw reality. See exactly how much bigger viral videos are compared to the rest. The gaps here are massive."
                    example="1M views is 10x larger than 100K views."
                    parentRect={hoveredItemRect}
                />
            )}
            {isSettingsOpen && hoveredScalingMode === 'sqrt' && (
                <ScalingTooltip
                    title="Square Root Scaling"
                    description="Heavy emphasis on top performers. Reduces the extreme gaps of Linear, but viral hits still clearly dominate the chart."
                    example="1M views is ~3.2x larger than 100K views."
                    parentRect={hoveredItemRect}
                />
            )}
            {isSettingsOpen && hoveredScalingMode === 'log' && (
                <ScalingTooltip
                    title="Logarithmic Scaling"
                    description="The great equalizer. Spreads out all videos evenly so you can see patterns across small, medium, and huge channels."
                    example="1M views is only ~1.2x larger than 100K views."
                    parentRect={hoveredItemRect}
                />
            )}
            {isSettingsOpen && hoveredScalingMode === 'percentile' && (
                <ScalingTooltip
                    title="Percentile Scaling"
                    description="Rank-based sizing. Ignores absolute view counts to simply show which videos performed best relative to others."
                    example="1M (Top 1%) is max size. 100K is sized by rank, ignoring the 10x gap."
                    parentRect={hoveredItemRect}
                />
            )}

            {/* Baseline Tooltips */}
            {isSettingsOpen && hoveredBaselineMode === 'dynamic' && (
                <ScalingTooltip
                    title="Dynamic Baseline"
                    description="Adaptable moving average. Shows how channel performance evolves over time (30-day rolling window)."
                    example="Best for: Seeing trends, growth, or decline periods."
                    parentRect={hoveredItemRect}
                />
            )}
            {isSettingsOpen && hoveredBaselineMode === 'global' && (
                <ScalingTooltip
                    title="Global Baseline"
                    description="Fixed historic average. A single flat line representing the average views of all displayed videos."
                    example="Best for: Comparing against all-time performance standard."
                    parentRect={hoveredItemRect}
                />
            )}
        </div>
    );
};
