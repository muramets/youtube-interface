import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (vi.hoisted to avoid reference-before-init with vi.mock hoisting) ---

const {
    mockGet,
    mockSet,
    mockUpdate,
    mockLoggerWarn,
    mockLoggerError,
} = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockSet: vi.fn(),
    mockUpdate: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerError: vi.fn(),
}));

vi.mock("../../shared/db.js", () => ({
    db: {
        doc: () => ({
            get: mockGet,
            set: mockSet,
            update: mockUpdate,
        }),
    },
}));

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: {
        increment: (val: number) => ({ __increment: val }),
    },
}));

vi.mock("firebase-functions/v2", () => ({
    logger: {
        warn: mockLoggerWarn,
        error: mockLoggerError,
    },
}));

import { checkBudget, recordCost } from "../budgetTracker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function budgetSnap(data: Record<string, unknown> | null) {
    return {
        exists: data !== null,
        data: () => data,
    };
}

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkBudget", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSet.mockResolvedValue(undefined);
        mockUpdate.mockResolvedValue(undefined);
    });

    it("creates doc with defaults on first run (doc not exists)", async () => {
        mockGet.mockResolvedValueOnce(budgetSnap(null));

        const result = await checkBudget();

        expect(result).toEqual({
            allowed: true,
            remaining: 5,
            currentCost: 0,
        });
        expect(mockSet).toHaveBeenCalledWith(
            expect.objectContaining({
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 0,
                monthlyLimit: 5,
                alertTriggered: false,
            }),
            { merge: true },
        );
    });

    it("returns allowed when within limit", async () => {
        mockGet.mockResolvedValueOnce(
            budgetSnap({
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 2,
                monthlyLimit: 5,
                alertTriggered: false,
            }),
        );

        const result = await checkBudget();

        expect(result).toEqual({
            allowed: true,
            remaining: 3,
            currentCost: 2,
        });
    });

    it("returns not allowed when over limit", async () => {
        mockGet.mockResolvedValueOnce(
            budgetSnap({
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 6,
                monthlyLimit: 5,
                alertTriggered: true,
            }),
        );

        const result = await checkBudget();

        expect(result).toEqual({
            allowed: false,
            remaining: 0,
            currentCost: 6,
        });
    });

    it("resets cost on month rollover", async () => {
        mockGet.mockResolvedValueOnce(
            budgetSnap({
                currentMonth: "2020-01",
                totalEstimatedCost: 4.5,
                monthlyLimit: 5,
                alertTriggered: true,
            }),
        );

        const result = await checkBudget();

        expect(result).toEqual({
            allowed: true,
            remaining: 5,
            currentCost: 0,
        });
        expect(mockSet).toHaveBeenCalledWith(
            {
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 0,
                alertTriggered: false,
            },
            { merge: true },
        );
    });
});

describe("recordCost", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdate.mockResolvedValue(undefined);
    });

    it("increments totalEstimatedCost atomically", async () => {
        mockGet.mockResolvedValueOnce(
            budgetSnap({
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 1.5,
                monthlyLimit: 5,
                alertTriggered: false,
            }),
        );

        await recordCost(0.5);

        expect(mockUpdate).toHaveBeenCalledWith({
            totalEstimatedCost: { __increment: 0.5 },
        });
    });

    it("logs warning at 80% threshold and sets alertTriggered", async () => {
        // After increment, read-back shows cost at 80%+ ($4.5 >= $4)
        mockGet.mockResolvedValueOnce(
            budgetSnap({
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 4.5,
                monthlyLimit: 5,
                alertTriggered: false,
            }),
        );

        await recordCost(0.5);

        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "embeddingBudget:thresholdReached",
            expect.objectContaining({
                currentCost: 4.5,
                monthlyLimit: 5,
            }),
        );
        expect(mockUpdate).toHaveBeenCalledTimes(2); // increment + alertTriggered
    });

    it("does not log warning if alertTriggered already true", async () => {
        mockGet.mockResolvedValueOnce(
            budgetSnap({
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 4.5,
                monthlyLimit: 5,
                alertTriggered: true,
            }),
        );

        await recordCost(0.5);

        expect(mockLoggerWarn).not.toHaveBeenCalled();
        // Only 1 update call (increment), not 2 (no alertTriggered update)
        expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it("logs error at 100% threshold", async () => {
        mockGet.mockResolvedValueOnce(
            budgetSnap({
                currentMonth: getCurrentMonth(),
                totalEstimatedCost: 5,
                monthlyLimit: 5,
                alertTriggered: true,
            }),
        );

        await recordCost(0.5);

        expect(mockLoggerError).toHaveBeenCalledWith(
            "embeddingBudget:limitReached",
            expect.objectContaining({
                currentCost: 5,
                monthlyLimit: 5,
            }),
        );
    });
});
