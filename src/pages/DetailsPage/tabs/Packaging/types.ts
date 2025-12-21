/**
 * Packaging Tab - Type Definitions
 * 
 * Central location for all Packaging-related types.
 * Single source of truth - import from here, don't duplicate.
 */

import React from 'react';
import { type PackagingVersion, type VideoLocalization, type CoverVersion } from '../../../../core/utils/youtubeApi';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * BUSINESS LOGIC: Default values for optional video fields
 * 
 * - Tags: Can be empty array - valid state when video has no tags
 * - Localizations: Always has at least EN (English) as default language
 * - AB Results: Empty until A/B test is configured
 * - Cover History: Empty until user uploads thumbnails
 */
export const DEFAULT_TAGS: string[] = [];
export const DEFAULT_LOCALIZATIONS: Record<string, VideoLocalization> = {};
export const DEFAULT_AB_RESULTS: ABTestResults = { titles: [], thumbnails: [] };
export const DEFAULT_COVER_HISTORY: CoverVersion[] = [];

// ============================================================================
// A/B TESTING TYPES
// ============================================================================

/**
 * BUSINESS LOGIC: A/B Test Results
 * 
 * - Maximum 3 variants per test (consistent with YouTube)
 * - Each number represents watch time share percentage (0-100)
 * - Sum of percentages should equal 100 when test is complete
 */
export interface ABTestResults {
    titles: number[];
    thumbnails: number[];
}

// ============================================================================
// VERSION STATE
// ============================================================================

/**
 * BUSINESS LOGIC: Packaging Version Snapshot
 * 
 * Immutable snapshot of form state at a point in time.
 * Used for:
 * - Historical versions (read-only viewing)
 * - Dirty state comparison
 * - Undo/Cancel functionality
 */
export interface PackagingSnapshot {
    title: string;
    description: string;
    tags: string[];
    coverImage: string | null;
    abTestTitles?: string[];
    abTestThumbnails?: string[];
    abTestResults?: ABTestResults;
    localizations?: Record<string, VideoLocalization>;
}

/**
 * BUSINESS LOGIC: Version State from usePackagingVersions hook
 * 
 * Manages packaging version history:
 * - 'draft' = current unsaved changes
 * - number = saved version (read-only when viewing historical)
 * 
 * Coordination with DetailsLayout:
 * - PackagingTab tracks isDirty
 * - DetailsLayout shows confirmation modal on version switch
 */
export interface VersionState {
    // Version History
    packagingHistory: PackagingVersion[];
    sortedVersions: PackagingVersion[];
    currentVersionNumber: number;
    hasDraft: boolean;

    // Current State
    activeVersion: number | 'draft';      // What version is "active" (being edited)
    viewingVersion: number | 'draft';     // What version is displayed (may be historical)

    // Actions
    switchToVersion: (versionNumber: number | 'draft') => void;
    restoreVersion: (versionNumber: number) => void;
    createVersion: (snapshot: PackagingSnapshot) => PackagingVersion;
    saveDraft: () => void;
    deleteVersion: (versionNumber: number) => void;
    markDirty: () => void;

    // Getters
    getVersionSnapshot: (versionNumber: number) => PackagingSnapshot | null;
    getVersionsPayload: () => {
        packagingHistory: PackagingVersion[];
        currentPackagingVersion: number;
        isDraft: boolean;
    };

    // Direct state setters (for sync with saved data)
    setPackagingHistory: React.Dispatch<React.SetStateAction<PackagingVersion[]>>;
    setHasDraft: React.Dispatch<React.SetStateAction<boolean>>;
    setActiveVersion: React.Dispatch<React.SetStateAction<number | 'draft'>>;
}

/**
 * BUSINESS LOGIC: Loaded Snapshot for Dirty Tracking
 * 
 * Stores the last saved/loaded state.
 * Used to determine if current form has unsaved changes.
 * Updated after:
 * - Initial load
 * - Successful save
 * - Version switch
 */
export interface LoadedSnapshot {
    title: string;
    description: string;
    tags: string[];
    customImage: string;
    localizations: Record<string, VideoLocalization>;
    abTestTitles: string[];
    abTestThumbnails: string[];
    abTestResults: ABTestResults;
    coverHistory: CoverVersion[];
}
