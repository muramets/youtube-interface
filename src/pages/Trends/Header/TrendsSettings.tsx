import React, { useState, useRef } from 'react';
import { Settings, Maximize2, Check } from 'lucide-react';
import type { TimelineConfig } from '../../../core/types/trends';
import { ScalingTooltip } from './ScalingTooltip';
import { Dropdown } from '../../../components/Shared/Dropdown';

interface TrendsSettingsProps {
    timelineConfig: TimelineConfig;
    setTimelineConfig: (config: Partial<TimelineConfig>) => void;
}

export const TrendsSettings: React.FC<TrendsSettingsProps> = ({ timelineConfig, setTimelineConfig }) => {
    // Settings Dropdown State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsView, setSettingsView] = useState<'main' | 'scaling'>('main');
    const settingsButtonRef = useRef<HTMLButtonElement>(null);

    // Tooltip State
    const [hoveredScalingMode, setHoveredScalingMode] = useState<'linear' | 'log' | 'sqrt' | 'percentile' | null>(null);
    const [hoveredItemRect, setHoveredItemRect] = useState<DOMRect | null>(null);

    const handleMouseEnter = (mode: 'linear' | 'log' | 'sqrt' | 'percentile', e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setHoveredScalingMode(mode);
        setHoveredItemRect(rect);
    };

    const handleMouseLeave = () => {
        setHoveredScalingMode(null);
        setHoveredItemRect(null);
    };

    const handleClose = () => {
        setIsSettingsOpen(false);
        setTimeout(() => setSettingsView('main'), 200); // Reset on close
    };

    return (
        <div className="relative">
            <button
                ref={settingsButtonRef}
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
                anchorEl={settingsButtonRef.current}
                width={240}
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

                    </div>
                ) : (
                    /* Scaling Submenu (Default Fallback if not main) */
                    <div className="pb-2">
                        <div className="px-4 py-3 flex items-center gap-2 border-b border-border mb-2">
                            <button
                                onClick={() => setSettingsView('main')}
                                className="p-1 -ml-2 hover:bg-hover-bg rounded-full text-text-primary"
                            >
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                            </button>
                            <span className="text-base font-medium">Size Scaling</span>
                        </div>

                        <div className="px-4 py-2 text-xs text-text-secondary">
                            Adjust how video thumbnails are sized
                        </div>

                        <div
                            onClick={() => setTimelineConfig({ scalingMode: 'linear' })}
                            onMouseEnter={(e) => handleMouseEnter('linear', e)}
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
                            onMouseEnter={(e) => handleMouseEnter('sqrt', e)}
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
                            onMouseEnter={(e) => handleMouseEnter('log', e)}
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
                            onMouseEnter={(e) => handleMouseEnter('percentile', e)}
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
        </div>
    );
};
