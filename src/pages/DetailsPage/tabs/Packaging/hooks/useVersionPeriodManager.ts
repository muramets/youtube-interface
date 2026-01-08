import { useCallback } from 'react';
import type { PackagingVersion } from '../../../../../core/utils/youtubeApi';
import type { TrafficSnapshot } from '../../../../../core/types/traffic';

/**
 * BUSINESS LOGIC: Version Period Management
 * 
 * This hook manages the complex logic of tracking when versions are active
 * and how traffic snapshots relate to those periods.
 * 
 * Key Responsibilities:
 * 1. Create new activation periods when versions are created/restored
 * 2. Close periods when versions are replaced
 * 3. Link snapshots to the periods they close
 * 4. Calculate view deltas between snapshots
 * 
 * Example Timeline:
 * Day 1: v.1 created → activePeriods: [{ startDate: Day1, endDate: undefined }]
 * Day 2: v.2 created with CSV → 
 *   - v.1: activePeriods: [{ startDate: Day1, endDate: Day2, closingSnapshotId: "snap_day2" }]
 *   - v.2: activePeriods: [{ startDate: Day2, endDate: undefined }]
 * Day 3: v.1 restored with CSV →
 *   - v.2: activePeriods: [{ startDate: Day2, endDate: Day3, closingSnapshotId: "snap_day3" }]
 *   - v.1: activePeriods: [
 *       { startDate: Day1, endDate: Day2, closingSnapshotId: "snap_day2" },
 *       { startDate: Day3, endDate: undefined } ← NEW period!
 *     ]
 */
export const useVersionPeriodManager = () => {
    /**
     * BUSINESS LOGIC: Generate Snapshot ID
     * 
     * Creates a unique ID for a traffic snapshot.
     * Format: "snap_" + timestamp + "_v" + versionNumber
     * 
     * This ID is used to link snapshots to version periods in
     * PackagingVersion.activePeriods[].closingSnapshotId
     */
    const generateSnapshotId = useCallback((timestamp: number, versionNumber: number): string => {
        return `snap_${timestamp}_v${versionNumber}`;
    }, []);

    /**
     * BUSINESS LOGIC: Initialize Active Periods for Existing Versions
     * 
     * For backward compatibility, converts old versions (with only startDate/endDate)
     * to new format with activePeriods array.
     * 
     * This is called when loading existing packaging history from Firestore.
     */
    const initializeActivePeriods = useCallback((version: PackagingVersion): PackagingVersion => {
        // If already has activePeriods, return as-is
        if (version.activePeriods && version.activePeriods.length > 0) {
            return version;
        }

        // Convert old format to new format
        return {
            ...version,
            activePeriods: [{
                startDate: version.startDate,
                endDate: version.endDate,
                closingSnapshotId: undefined // No snapshots in old data
            }]
        };
    }, []);

    /**
     * BUSINESS LOGIC: Close Current Version Period
     * 
     * When creating a new version or restoring an old one, we need to "close"
     * the currently active version's period.
     * 
     * Steps:
     * 1. Find the current version in history
     * 2. Find its active period (the one without endDate)
     * 3. Set endDate to now
     * 4. Link the closing snapshot (if provided)
     * 
     * @param packagingHistory - Current array of all versions
     * @param currentVersionNumber - The version to close
     * @param closingSnapshot - Optional snapshot that closes this period
     * @returns Updated packaging history with closed period
     */
    const closeCurrentPeriod = useCallback((
        packagingHistory: PackagingVersion[],
        currentVersionNumber: number,
        closingSnapshot?: TrafficSnapshot
    ): PackagingVersion[] => {
        const now = Date.now();

        return packagingHistory.map(version => {
            if (version.versionNumber !== currentVersionNumber) {
                return version;
            }

            // Initialize activePeriods if needed
            const periods = version.activePeriods || [{
                startDate: version.startDate,
                endDate: version.endDate,
                closingSnapshotId: undefined
            }];

            // Find the active period (no endDate)
            const activePeriodIndex = periods.findIndex(p => p.endDate === undefined);

            if (activePeriodIndex === -1) {
                // No active period found - this shouldn't happen, but handle gracefully
                console.warn(`No active period found for v.${currentVersionNumber}`);
                return version;
            }

            // Close the active period
            const updatedPeriods = [...periods];
            updatedPeriods[activePeriodIndex] = {
                ...updatedPeriods[activePeriodIndex],
                endDate: now,
                closingSnapshotId: closingSnapshot?.id
            };

            return {
                ...version,
                endDate: now, // Update deprecated field for backward compat
                activePeriods: updatedPeriods
            };
        });
    }, []);

    /**
     * BUSINESS LOGIC: Create New Version with Period
     * 
     * When creating a new version (e.g., v.2 → v.3):
     * 1. Close the current version's (v.2) active period
     * 2. Create the new version (v.3) with a fresh activation period
     * 
     * @param packagingHistory - Current array of all versions
     * @param currentVersionNumber - The currently active version (to be closed)
     * @param newVersion - The new version being created
     * @param closingSnapshot - Snapshot that closes the current version
     * @returns Updated packaging history with new version and closed period
     */
    const createNewVersionWithPeriod = useCallback((
        packagingHistory: PackagingVersion[],
        currentVersionNumber: number,
        newVersion: PackagingVersion,
        closingSnapshot?: TrafficSnapshot
    ): PackagingVersion[] => {
        // Close the current version's period
        const historyWithClosedPeriod = closeCurrentPeriod(
            packagingHistory,
            currentVersionNumber,
            closingSnapshot
        );

        // Add the new version with its first activation period
        const newVersionWithPeriod: PackagingVersion = {
            ...newVersion,
            activePeriods: [{
                startDate: newVersion.startDate,
                endDate: undefined, // Currently active
                closingSnapshotId: undefined
            }]
        };

        return [...historyWithClosedPeriod, newVersionWithPeriod];
    }, [closeCurrentPeriod]);

    /**
     * BUSINESS LOGIC: Restore Version with New Period
     * 
     * When restoring an old version (e.g., v.3 → v.1):
     * 1. Close the current version's (v.3) active period
     * 2. Add a NEW activation period to the restored version (v.1)
     * 
     * IMPORTANT: We don't reuse the old period! We create a new one.
     * This allows accurate attribution of views to each activation period.
     * 
     * @param packagingHistory - Current array of all versions
     * @param currentVersionNumber - The currently active version (to be closed)
     * @param restoredVersionNumber - The version being restored
     * @param closingSnapshot - Snapshot that closes the current version
     * @returns Updated packaging history with new period for restored version
     */
    const restoreVersionWithNewPeriod = useCallback((
        packagingHistory: PackagingVersion[],
        currentVersionNumber: number,
        restoredVersionNumber: number,
        closingSnapshot?: TrafficSnapshot
    ): PackagingVersion[] => {
        const now = Date.now();

        // Close the current version's period
        let updatedHistory = closeCurrentPeriod(
            packagingHistory,
            currentVersionNumber,
            closingSnapshot
        );

        // Add new activation period to the restored version
        updatedHistory = updatedHistory.map(version => {
            if (version.versionNumber !== restoredVersionNumber) {
                return version;
            }

            // Initialize activePeriods if needed
            const periods = version.activePeriods || [{
                startDate: version.startDate,
                endDate: version.endDate,
                closingSnapshotId: undefined
            }];

            // Add new period
            const newPeriod = {
                startDate: now,
                endDate: undefined, // Currently active
                closingSnapshotId: undefined
            };

            return {
                ...version,
                startDate: now, // Update deprecated field for backward compat
                endDate: undefined, // Clear endDate since version is now active
                activePeriods: [...periods, newPeriod]
            };
        });

        return updatedHistory;
    }, [closeCurrentPeriod]);

    /**
     * BUSINESS LOGIC: Get Current Active Period Index
     * 
     * Finds the index of the currently active period for a version.
     * Active period is the one without an endDate.
     * 
     * @param version - The version to check
     * @returns Index of active period, or -1 if none found
     */
    const getActivePeriodIndex = useCallback((version: PackagingVersion): number => {
        if (!version.activePeriods || version.activePeriods.length === 0) {
            return 0; // Assume first period if not initialized
        }

        return version.activePeriods.findIndex(p => p.endDate === undefined);
    }, []);

    return {
        generateSnapshotId,
        initializeActivePeriods,
        closeCurrentPeriod,
        createNewVersionWithPeriod,
        restoreVersionWithNewPeriod,
        getActivePeriodIndex
    };
};
