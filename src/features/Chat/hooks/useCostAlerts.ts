// =============================================================================
// useCostAlerts — computes cost alert state from conversation messages.
// Pure computation hook — no side effects.
// =============================================================================

import { useMemo } from 'react';
import type { ChatMessage } from '../../../core/types/chat/chat';
import { MODEL_REGISTRY } from '../../../core/types/chat/chat';
import { computeIterationCost } from '../../../../shared/models';
import type { ModelPricing, IterationSnapshot } from '../../../../shared/models';

// --- Alert thresholds (named constants, not magic numbers) ---
export const COST_THRESHOLD_LOW = 1;       // $1 — yellow
export const COST_THRESHOLD_MEDIUM = 5;    // $5 — orange
export const COST_THRESHOLD_HIGH = 10;     // $10 — red
export const EXPENSIVE_MESSAGE_THRESHOLD = 0.50; // $0.50 per message
export const RECOMMENDATION_SAVINGS_MIN = 0.30;  // 30% savings to recommend

export type AlertLevel = 'none' | 'low' | 'medium' | 'high';

export interface CostAlert {
    level: AlertLevel;
    totalCostUsd: number;
    expensiveMessageIds: string[];
    recommendation: string | null;
}

/** Get alert level from total cost. */
function getAlertLevel(totalCostUsd: number): AlertLevel {
    if (totalCostUsd >= COST_THRESHOLD_HIGH) return 'high';
    if (totalCostUsd >= COST_THRESHOLD_MEDIUM) return 'medium';
    if (totalCostUsd >= COST_THRESHOLD_LOW) return 'low';
    return 'none';
}

/**
 * Estimate what the conversation would cost with an alternative model's pricing.
 * Reuses computeIterationCost — no duplicate pricing logic.
 */
export function estimateAlternativeCost(
    messages: ChatMessage[],
    altPricing: ModelPricing,
): number {
    let total = 0;
    for (const msg of messages) {
        if (msg.role !== 'model') continue;
        const nu = msg.normalizedUsage;
        if (!nu) continue;

        if (nu.iterationDetails && nu.iterationDetails.length > 0) {
            for (const iter of nu.iterationDetails) {
                const cost = computeIterationCost(altPricing, iter as Pick<IterationSnapshot, 'input' | 'output'>);
                total += cost.total;
            }
        } else {
            // Single iteration — use billing totals
            const fakeSnapshot = {
                input: nu.billing.input,
                output: nu.billing.output,
            };
            const cost = computeIterationCost(altPricing, fakeSnapshot as Pick<IterationSnapshot, 'input' | 'output'>);
            total += cost.total;
        }
    }
    return total;
}

export function useCostAlerts(
    messages: ChatMessage[],
    activeModel: string,
): CostAlert {
    return useMemo(() => {
        // Sum conversation cost from normalizedUsage
        let totalCostUsd = 0;
        const expensiveMessageIds: string[] = [];

        for (const msg of messages) {
            if (msg.role !== 'model') continue;
            const cost = msg.normalizedUsage?.billing?.cost?.total ?? 0;
            totalCostUsd += cost;
            if (cost >= EXPENSIVE_MESSAGE_THRESHOLD && msg.id) {
                expensiveMessageIds.push(msg.id);
            }
        }

        const level = getAlertLevel(totalCostUsd);

        // Model recommendation: find cheapest model from same provider
        let recommendation: string | null = null;
        if (totalCostUsd > 0) {
            const currentConfig = MODEL_REGISTRY.find(m => m.id === activeModel);
            if (currentConfig) {
                const sameProviderModels = MODEL_REGISTRY.filter(
                    m => m.provider === currentConfig.provider && m.id !== activeModel && m.pricing
                );

                let bestSaving = 0;
                let bestModel = '';

                for (const alt of sameProviderModels) {
                    const altCost = estimateAlternativeCost(messages, alt.pricing);
                    const saving = totalCostUsd - altCost;
                    const savingPct = totalCostUsd > 0 ? saving / totalCostUsd : 0;

                    if (savingPct > RECOMMENDATION_SAVINGS_MIN && saving > bestSaving) {
                        bestSaving = saving;
                        bestModel = alt.label;
                    }
                }

                if (bestModel) {
                    const pct = Math.round((bestSaving / totalCostUsd) * 100);
                    recommendation = `Switching to ${bestModel} would save ~${pct}% for this conversation`;
                }
            }
        }

        return { level, totalCostUsd, expensiveMessageIds, recommendation };
    }, [messages, activeModel]);
}
