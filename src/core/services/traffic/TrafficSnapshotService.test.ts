import { describe, it, expect, vi } from 'vitest';
import { TrafficSnapshotService } from './TrafficSnapshotService';

// Подменяем внешние зависимости (базу данных и хранилище файлов)
vi.mock('./TrafficDataService', () => ({
    TrafficDataService: {
        fetch: vi.fn(),
        save: vi.fn()
    }
}));

vi.mock('../storageService', () => ({
    uploadCsvSnapshot: vi.fn(),
    downloadCsvSnapshot: vi.fn(),
    deleteCsvSnapshot: vi.fn()
}));

// Важная настройка: мы не хотим реально парсить CSV в тестах, 
// поэтому подменяем парсер
vi.mock('../../../pages/DetailsPage/tabs/Traffic/utils/csvParser', () => ({
    parseTrafficCsv: vi.fn().mockResolvedValue({ sources: [{ sourceTitle: 'CSV Data' }] })
}));

describe('TrafficSnapshotService', () => {

    describe('getVersionSources', () => {
        const snapshots = [
            { id: '1', version: 1, timestamp: 1000, sources: [{ sourceTitle: 'V1 Start' }] },
            { id: '2', version: 1, timestamp: 20000, sources: [{ sourceTitle: 'V1 End' }] },
            { id: '3', version: 2, timestamp: 30000, sources: [{ sourceTitle: 'V2' }] }
        ];

        it('должен возвращать самый свежий снапшот для указанной версии', async () => {
            const sources = await TrafficSnapshotService.getVersionSources(1, snapshots as any);

            // Для версии 1 есть два снапшота. Должен выбраться самый поздний (V1 End).
            expect(sources.sources[0].sourceTitle).toBe('V1 End');
        });

        it('должен правильно выбирать снапшот внутри указанного периода (важно для Restored версий)', async () => {
            // Ищем версию 1, но именно в периоде между 0 и 5000
            const sources = await TrafficSnapshotService.getVersionSources(1, snapshots as any, 0, 5000);

            expect(sources.sources[0].sourceTitle).toBe('V1 Start');
        });

        it('должен возвращать пустой список, если снапшотов для версии нет', async () => {
            const sources = await TrafficSnapshotService.getVersionSources(99, snapshots as any);
            expect(sources.sources).toEqual([]);
        });

        it('должен поддерживать "гибридную" загрузку (из Cloud Storage), если данных нет в базе', async () => {
            const hybridSnapshots = [
                { id: 'h1', version: 3, timestamp: 5000, storagePath: 'test/path.csv' }
            ];

            const sources = await TrafficSnapshotService.getVersionSources(3, hybridSnapshots as any);

            // Мы замокали парсер выше, он должен вернуть 'CSV Data'
            expect(sources.sources[0].sourceTitle).toBe('CSV Data');
        });
    });
});
