// =============================================================================
// Budget Tracker — embedding cost safeguard
//
// Tracks monthly embedding API spend in Firestore (system/embeddingBudget).
// Hard stop at 100% of monthly limit, warning at 80%.
// Uses FieldValue.increment for atomic, concurrent-safe cost recording.
// =============================================================================

import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../shared/db.js";
import {
    DEFAULT_MONTHLY_BUDGET_LIMIT,
    BUDGET_WARN_THRESHOLD,
    type EmbeddingBudget,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BUDGET_DOC_PATH = "system/embeddingBudget";

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
}

// ---------------------------------------------------------------------------
// checkBudget — read current budget state, handle month rollover
// ---------------------------------------------------------------------------

export async function checkBudget(): Promise<{
    allowed: boolean;
    remaining: number;
    currentCost: number;
}> {
    const docRef = db.doc(BUDGET_DOC_PATH);
    const snap = await docRef.get();
    const currentMonth = getCurrentMonth();

    if (!snap.exists) {
        // First run: create doc with defaults
        const initial: EmbeddingBudget = {
            currentMonth,
            totalEstimatedCost: 0,
            monthlyLimit: DEFAULT_MONTHLY_BUDGET_LIMIT,
            alertTriggered: false,
        };
        await docRef.set(initial, { merge: true });
        return {
            allowed: true,
            remaining: DEFAULT_MONTHLY_BUDGET_LIMIT,
            currentCost: 0,
        };
    }

    const data = snap.data() as EmbeddingBudget;

    // Month rollover: reset cost if month changed
    if (data.currentMonth !== currentMonth) {
        await docRef.set(
            {
                currentMonth,
                totalEstimatedCost: 0,
                alertTriggered: false,
            },
            { merge: true },
        );
        return {
            allowed: true,
            remaining: data.monthlyLimit,
            currentCost: 0,
        };
    }

    const remaining = Math.max(0, data.monthlyLimit - data.totalEstimatedCost);
    return {
        allowed: data.totalEstimatedCost < data.monthlyLimit,
        remaining,
        currentCost: data.totalEstimatedCost,
    };
}

// ---------------------------------------------------------------------------
// recordCost — atomically increment cost, check thresholds
// ---------------------------------------------------------------------------

export async function recordCost(amount: number): Promise<void> {
    const docRef = db.doc(BUDGET_DOC_PATH);

    await docRef.update({
        totalEstimatedCost: FieldValue.increment(amount),
    });

    // Read back to check thresholds
    const snap = await docRef.get();
    const data = snap.data() as EmbeddingBudget;

    // 100% threshold — hard limit reached
    if (data.totalEstimatedCost >= data.monthlyLimit) {
        logger.error("embeddingBudget:limitReached", {
            currentCost: data.totalEstimatedCost,
            monthlyLimit: data.monthlyLimit,
        });
    }

    // 80% threshold — warning (once per month)
    if (
        data.totalEstimatedCost >= data.monthlyLimit * BUDGET_WARN_THRESHOLD &&
        !data.alertTriggered
    ) {
        logger.warn("embeddingBudget:thresholdReached", {
            currentCost: data.totalEstimatedCost,
            monthlyLimit: data.monthlyLimit,
            threshold: `${BUDGET_WARN_THRESHOLD * 100}%`,
        });
        await docRef.update({ alertTriggered: true });
    }
}
