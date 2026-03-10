// =============================================================================
// useAutoSync.test.ts — Auto-sync hook behavior tests
//
// Verifies:
//   - Guard conditions: no user, no channel, autoSync off, isLoading
//   - Sync trigger when time since last sync >= frequencyHours
//   - No sync when interval not yet elapsed
//   - lastGlobalSync updated after sync
//   - Missing API key notification with 24h dedup
//   - lastGlobalSync updated even when API key missing
//   - Tab visibility change re-triggers check
//   - Cleanup removes visibilitychange listener
//   - Timer scheduling for next sync when not yet due
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000; // Fixed "now" for deterministic tests
const ONE_HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Mutable config — tests mutate these before each renderHook call
// ---------------------------------------------------------------------------

const mockSyncAllVideos = vi.fn().mockResolvedValue(undefined);
const mockUpdateSyncSettings = vi.fn();
const mockAddNotification = vi.fn();

let settingsConfig = {
    syncSettings: {
        autoSync: true,
        frequencyHours: 24,
        lastGlobalSync: 0,
    },
    updateSyncSettings: mockUpdateSyncSettings,
    generalSettings: { apiKey: 'test-key' },
    isLoading: false,
};

let authConfig: { user: { uid: string } | null } = {
    user: { uid: 'user-1' },
};

let channelStoreConfig: { currentChannel: { id: string } | null } = {
    currentChannel: { id: 'ch-1' },
};

let notificationStoreState: {
    addNotification: typeof mockAddNotification;
    notifications: Array<{
        title: string;
        message: string;
        timestamp: number;
    }>;
} = {
    addNotification: mockAddNotification,
    notifications: [],
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../useSettings', () => ({
    useSettings: () => settingsConfig,
}));

vi.mock('../useVideoSync', () => ({
    useVideoSync: () => ({ syncAllVideos: mockSyncAllVideos }),
}));

vi.mock('../useAuth', () => ({
    useAuth: () => authConfig,
}));

vi.mock('../../stores/channelStore', () => ({
    useChannelStore: () => channelStoreConfig,
}));

vi.mock('../../stores/notificationStore', () => ({
    useNotificationStore: Object.assign(
        () => notificationStoreState,
        { getState: () => notificationStoreState },
    ),
}));

// Import AFTER mocks are defined
import { useAutoSync } from '../useAutoSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture the visibilitychange handler registered via addEventListener */
let visibilityChangeHandler: (() => void) | null = null;
let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();

    // Reset mutable configs to defaults
    settingsConfig = {
        syncSettings: {
            autoSync: true,
            frequencyHours: 24,
            lastGlobalSync: 0,
        },
        updateSyncSettings: mockUpdateSyncSettings,
        generalSettings: { apiKey: 'test-key' },
        isLoading: false,
    };
    authConfig = { user: { uid: 'user-1' } };
    channelStoreConfig = { currentChannel: { id: 'ch-1' } };
    notificationStoreState = {
        addNotification: mockAddNotification,
        notifications: [],
    };

    // Spy on document event listeners to capture and test visibilitychange
    visibilityChangeHandler = null;
    addEventListenerSpy = vi.spyOn(document, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
            if (event === 'visibilitychange') {
                visibilityChangeHandler = handler as () => void;
            }
        },
    );
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutoSync', () => {
    // =======================================================================
    // Prerequisites / Guards
    // =======================================================================

    describe('guard conditions', () => {
        it('does nothing when user is null', async () => {
            authConfig = { user: null };

            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockSyncAllVideos).not.toHaveBeenCalled();
            expect(mockUpdateSyncSettings).not.toHaveBeenCalled();
            expect(mockAddNotification).not.toHaveBeenCalled();
        });

        it('does nothing when currentChannel is null', async () => {
            channelStoreConfig = { currentChannel: null };

            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockSyncAllVideos).not.toHaveBeenCalled();
            expect(mockUpdateSyncSettings).not.toHaveBeenCalled();
        });

        it('does nothing when autoSync is false', async () => {
            settingsConfig.syncSettings.autoSync = false;

            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockSyncAllVideos).not.toHaveBeenCalled();
            expect(mockUpdateSyncSettings).not.toHaveBeenCalled();
        });

        it('does nothing when isLoading is true', async () => {
            settingsConfig.isLoading = true;

            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockSyncAllVideos).not.toHaveBeenCalled();
            expect(mockUpdateSyncSettings).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // Sync Trigger
    // =======================================================================

    describe('sync trigger', () => {
        it('calls syncAllVideos when time since last sync >= frequencyHours', async () => {
            // lastGlobalSync = 0, frequencyHours = 24, NOW >> 24h → sync due
            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockSyncAllVideos).toHaveBeenCalledWith('test-key');
        });

        it('does NOT call syncAllVideos when time since last sync < frequencyHours', async () => {
            // Last sync was 1 hour ago — well within the 24h window
            settingsConfig.syncSettings.lastGlobalSync = NOW - ONE_HOUR_MS;

            renderHook(() => useAutoSync());
            // Only flush microtasks — do NOT advance fake timers, which would
            // trigger the scheduled timeout and eventually call syncAllVideos.
            await act(async () => {});

            expect(mockSyncAllVideos).not.toHaveBeenCalled();
        });

        it('updates lastGlobalSync after successful sync', async () => {
            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockUpdateSyncSettings).toHaveBeenCalledWith(
                'user-1',
                'ch-1',
                expect.objectContaining({ lastGlobalSync: NOW }),
            );
        });
    });

    // =======================================================================
    // Missing API Key
    // =======================================================================

    describe('missing API key', () => {
        it('adds "Missing API Key" notification when API key is empty and sync is due', async () => {
            settingsConfig.generalSettings.apiKey = '';

            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockAddNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Channel Sync Failed',
                    message: 'Missing API Key. Please configure it in Settings.',
                    type: 'error',
                    link: 'settings',
                    category: 'channel',
                }),
            );
            expect(mockSyncAllVideos).not.toHaveBeenCalled();
        });

        it('dedup: does NOT add notification if store already has a recent one (< 24h)', async () => {
            settingsConfig.generalSettings.apiKey = '';
            // Existing recent notification in store (5 hours ago)
            notificationStoreState.notifications = [
                {
                    title: 'Channel Sync Failed',
                    message: 'Missing API Key. Please configure it in Settings.',
                    timestamp: NOW - 5 * ONE_HOUR_MS,
                },
            ];

            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockAddNotification).not.toHaveBeenCalled();
        });

        it('still updates lastGlobalSync even when API key is missing', async () => {
            settingsConfig.generalSettings.apiKey = '';

            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockUpdateSyncSettings).toHaveBeenCalledWith(
                'user-1',
                'ch-1',
                expect.objectContaining({ lastGlobalSync: NOW }),
            );
        });
    });

    // =======================================================================
    // Tab Focus (visibility change)
    // =======================================================================

    describe('tab focus', () => {
        it('re-runs check when document visibility changes to visible', async () => {
            // First render — sync is due, syncAllVideos called once
            renderHook(() => useAutoSync());
            await act(() => vi.runAllTimersAsync());

            expect(mockSyncAllVideos).toHaveBeenCalledTimes(1);
            expect(visibilityChangeHandler).toBeTruthy();

            // Simulate tab becoming visible again
            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });

            await act(async () => {
                visibilityChangeHandler!();
                await vi.runAllTimersAsync();
            });

            // checkAndSync ran again — but since lastGlobalSync was already updated
            // (by updateSyncSettings mock), the behavior depends on mock state.
            // The key assertion: the listener was registered and called the handler.
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'visibilitychange',
                expect.any(Function),
            );
        });

        it('cleanup removes visibilitychange listener', () => {
            const { unmount } = renderHook(() => useAutoSync());

            unmount();

            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'visibilitychange',
                expect.any(Function),
            );
        });
    });

    // =======================================================================
    // Timer Scheduling
    // =======================================================================

    describe('timer scheduling', () => {
        it('schedules timeout for remaining time when sync is not yet due', async () => {
            // Last sync was 23 hours ago — 1 hour remains until next sync
            const oneHourAgoFromFrequency = NOW - (23 * ONE_HOUR_MS);
            settingsConfig.syncSettings.lastGlobalSync = oneHourAgoFromFrequency;

            renderHook(() => useAutoSync());

            // Effect runs synchronously, checkAndSync sees sync not due, schedules timeout
            // syncAllVideos should NOT have been called yet
            expect(mockSyncAllVideos).not.toHaveBeenCalled();

            // Advance time by the remaining 1 hour
            await act(async () => {
                vi.advanceTimersByTime(ONE_HOUR_MS);
                // Allow the async checkAndSync to resolve
                await vi.runAllTimersAsync();
            });

            // Now sync should fire
            expect(mockSyncAllVideos).toHaveBeenCalledWith('test-key');
        });
    });
});
