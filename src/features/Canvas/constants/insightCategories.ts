// =============================================================================
// Insight category metadata — single source of truth.
// Consumed by InsightButtons, InsightPopover, GlobalInsightsBar.
// =============================================================================

import { Package, Palette, Music, type LucideIcon } from 'lucide-react';
import type { InsightCategory } from '../../../core/types/canvas';

export interface InsightCategoryMeta {
    key: InsightCategory;
    Icon: LucideIcon;
    label: string;
    color: string;
}

/** Ordered list of insight categories (used for iteration / rendering). */
export const INSIGHT_CATEGORIES: InsightCategoryMeta[] = [
    { key: 'packaging', Icon: Package, label: 'Packaging', color: '#F59E0B' },
    { key: 'visual', Icon: Palette, label: 'Visual', color: '#8B5CF6' },
    { key: 'music', Icon: Music, label: 'Music', color: '#EC4899' },
];

/** Keyed lookup for quick access by category. */
export const INSIGHT_CATEGORY_MAP: Record<InsightCategory, InsightCategoryMeta> =
    Object.fromEntries(INSIGHT_CATEGORIES.map((c) => [c.key, c])) as Record<InsightCategory, InsightCategoryMeta>;
