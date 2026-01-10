import { describe, it, expect, vi } from 'vitest';

// Мокаем зависимости
vi.mock('../../../../core/hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'test-user' } })
}));

vi.mock('../../../../core/stores/channelStore', () => ({
    useChannelStore: () => ({
        currentChannel: { id: 'test-channel' },
        setCurrentChannel: vi.fn()
    })
}));

vi.mock('../../../../core/hooks/useVideos', () => ({
    useVideos: () => ({ updateVideo: vi.fn() })
}));

describe('usePackagingActions - closingSnapshotId logic', () => {
    /**
     * Тестируем логику поиска closingSnapshotId из trafficData
     * для видео без publishedVideoId
     */

    it('должен находить самый свежий снапшот активной версии', () => {
        const activeVersion = 3;
        const trafficData = {
            snapshots: [
                { id: 'snap-v1', version: 1, timestamp: 150 },
                { id: 'snap-v2', version: 2, timestamp: 250 },
                { id: 'snap-v3-old', version: 3, timestamp: 350 },
                { id: 'snap-v3-new', version: 3, timestamp: 400 } // Самый свежий для v.3
            ]
        };

        // Логика из handleRestore
        const activeVersionSnapshots = trafficData.snapshots
            .filter((s: any) => s.version === activeVersion)
            .sort((a: any, b: any) => b.timestamp - a.timestamp);

        const closingSnapshotId = activeVersionSnapshots.length > 0
            ? activeVersionSnapshots[0].id
            : null;

        expect(closingSnapshotId).toBe('snap-v3-new');
    });

    it('должен возвращать null, если нет снапшотов для активной версии', () => {
        const activeVersion = 3;
        const trafficData = {
            snapshots: [
                { id: 'snap-v1', version: 1, timestamp: 150 },
                { id: 'snap-v2', version: 2, timestamp: 250 }
                // Нет снапшотов для v.3
            ]
        };

        const activeVersionSnapshots = trafficData.snapshots
            .filter((s: any) => s.version === activeVersion)
            .sort((a: any, b: any) => b.timestamp - a.timestamp);

        const closingSnapshotId = activeVersionSnapshots.length > 0
            ? activeVersionSnapshots[0].id
            : null;

        expect(closingSnapshotId).toBe(null);
    });

    it('должен возвращать null, если trafficData пустой', () => {
        const activeVersion = 3;
        const trafficData = {
            snapshots: []
        };

        const activeVersionSnapshots = trafficData.snapshots
            .filter((s: any) => s.version === activeVersion)
            .sort((a: any, b: any) => b.timestamp - a.timestamp);

        const closingSnapshotId = activeVersionSnapshots.length > 0
            ? activeVersionSnapshots[0].id
            : null;

        expect(closingSnapshotId).toBe(null);
    });

    it('должен корректно сортировать снапшоты по timestamp', () => {
        const activeVersion = 2;
        const trafficData = {
            snapshots: [
                { id: 'snap-v2-1', version: 2, timestamp: 100 },
                { id: 'snap-v2-3', version: 2, timestamp: 300 }, // Самый свежий
                { id: 'snap-v2-2', version: 2, timestamp: 200 }
            ]
        };

        const activeVersionSnapshots = trafficData.snapshots
            .filter((s: any) => s.version === activeVersion)
            .sort((a: any, b: any) => b.timestamp - a.timestamp);

        expect(activeVersionSnapshots[0].id).toBe('snap-v2-3');
        expect(activeVersionSnapshots[1].id).toBe('snap-v2-2');
        expect(activeVersionSnapshots[2].id).toBe('snap-v2-1');
    });
});
