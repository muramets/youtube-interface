import React, { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useCanvasStore, type CanvasState } from '../../core/stores/canvas/canvasStore';
import type { TrafficSourceCardData } from '../../core/types/appContext';
import type { InsightCategory } from '../../core/types/canvas';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { INSIGHT_CATEGORY_MAP } from './constants/insightCategories';

export const GlobalInsightsBar: React.FC = () => {
    const nodes = useCanvasStore((s: CanvasState) => s.nodes);

    // Aggregate all pinned insights from all traffic-source nodes
    const pinnedInsights = useMemo(() => {
        const insightsList: Array<{
            nodeId: string;
            category: InsightCategory;
            text: string;
            color: string;
            Icon: LucideIcon;
        }> = [];

        nodes.forEach((node) => {
            if (node.type !== 'traffic-source' || !node.data) return;
            const data = node.data as TrafficSourceCardData;
            if (!data.insights) return;

            (Object.entries(data.insights) as [InsightCategory, { text: string; pinned?: boolean }][]).forEach(([cat, v]) => {
                if (v?.pinned && v.text) {
                    const { Icon, color } = INSIGHT_CATEGORY_MAP[cat];
                    insightsList.push({
                        nodeId: node.id,
                        category: cat,
                        text: v.text,
                        color,
                        Icon,
                    });
                }
            });
        });

        return insightsList;
    }, [nodes]);

    if (pinnedInsights.length === 0) return null;

    const handleChipClick = (nodeId: string, category: InsightCategory) => {
        useCanvasStore.getState().panToNode(nodeId, () => {
            useCanvasStore.getState().selectNode(nodeId, false);
            useCanvasStore.getState().revealInsight(nodeId, category);
        });
    };

    return (
        <div className="absolute top-[60px] left-[18px] z-[100] pointer-events-none flex flex-wrap justify-start gap-2 max-w-[80vw]">
            {pinnedInsights.map((insight, i) => {
                const { Icon, color } = insight;
                return (
                    <PortalTooltip key={`${insight.nodeId}-${insight.category}-${i}`} content="Click to open insight" enterDelay={500} side="bottom">
                        <button
                            onClick={() => handleChipClick(insight.nodeId, insight.category)}
                            className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 shadow-xl hover:-translate-y-0.5"
                            style={{
                                background: 'color-mix(in srgb, var(--bg-secondary) 90%, transparent)',
                                backdropFilter: 'blur(12px)',
                                border: `1px solid color-mix(in srgb, var(--border) 60%, ${color} 40%)`,
                                boxShadow: `inset 4px 0 0 0 ${color}`,
                                maxWidth: '240px',
                            }}
                        >
                            <Icon size={12} strokeWidth={2.5} style={{ color }} className="shrink-0" />
                            <span
                                className="text-xs truncate font-medium"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                {insight.text}
                            </span>
                        </button>
                    </PortalTooltip>
                );
            })}
        </div>
    );
};
