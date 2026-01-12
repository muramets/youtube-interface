import { describe, it, expect, vi } from 'vitest';
import { TrafficDeltaService } from './TrafficDeltaService';
import type { TrafficSource } from '../../types/traffic';

// Мы мокаем (подменяем) другой сервис, чтобы протестировать только дельту,
// не запуская сложную логику загрузки файлов.
vi.mock('./TrafficSnapshotService', () => ({
    TrafficSnapshotService: {
        getVersionSources: vi.fn()
    }
}));

describe('TrafficDeltaService', () => {

    // Тест самого расчета разницы
    describe('calculateSourcesDelta', () => {
        const currentData: TrafficSource[] = [
            { sourceTitle: 'Поиск', views: 100, impressions: 1000, watchTimeHours: 10, ctr: 10, videoId: 'v1', sourceType: 'TEST', avgViewDuration: '0:00' },
            { sourceTitle: 'Рекомендации', views: 50, impressions: 500, watchTimeHours: 5, ctr: 10, videoId: 'v2', sourceType: 'TEST', avgViewDuration: '0:00' }
        ];

        const previousData: TrafficSource[] = [
            { sourceTitle: 'Поиск', views: 60, impressions: 800, watchTimeHours: 6, ctr: 7.5, videoId: 'v1', sourceType: 'TEST', avgViewDuration: '0:00' },
            { sourceTitle: 'Рекомендации', views: 50, impressions: 500, watchTimeHours: 5, ctr: 10, videoId: 'v2', sourceType: 'TEST', avgViewDuration: '0:00' }
        ];

        it('должен правильно вычитать просмотры и пересчитывать CTR', () => {
            const delta = TrafficDeltaService.calculateSourcesDelta(currentData, previousData);

            // Для 'Поиск': 100 - 60 = 40 просмотров. 1000 - 800 = 200 показов.
            // CTR = (40 / 200) * 100 = 20%
            const searchDelta = delta.find(d => d.sourceTitle === 'Поиск');
            expect(searchDelta?.views).toBe(40);
            expect(searchDelta?.ctr).toBe(20);
        });

        it('должен скрывать (фильтровать) источники, в которых 0 новых просмотров', () => {
            const delta = TrafficDeltaService.calculateSourcesDelta(currentData, previousData);

            // 'Рекомендации': 50 - 50 = 0. Должен быть удален из списка.
            const recDelta = delta.find(d => d.sourceTitle === 'Рекомендации');
            expect(recDelta).toBeUndefined();
        });

        it('должен возвращать полные данные, если предыдущей версии нет', () => {
            const delta = TrafficDeltaService.calculateSourcesDelta(currentData, []);
            expect(delta.length).toBe(2);
            expect(delta[0].views).toBe(100);
        });
    });

    // Тест выбора версии для расчета разницы
    describe('calculateVersionDelta', () => {
        const currentSources: TrafficSource[] = [{ sourceTitle: 'X', views: 10, videoId: '1', sourceType: 'TEST', avgViewDuration: '0:00', impressions: 100, ctr: 10, watchTimeHours: 1 }];

        it('если предыдущей версии нет, должен вернуть текущие данные', async () => {
            const delta = await TrafficDeltaService.calculateVersionDelta(currentSources, 1, []);
            expect(delta).toEqual(currentSources);
        });

        // В этом тесте мы проверяем, что сервис лезет в историю и находит нужную версию
        it('должен находить данные предыдущей версии и считать дельту', async () => {
            // Импортируем моканный сервис, чтобы настроить его поведение
            const { TrafficSnapshotService } = await import('./TrafficSnapshotService');

            // "Прикинемся", что предыдущая версия v.1 имела 4 просмотра
            (TrafficSnapshotService.getVersionSources as any).mockResolvedValue([
                { sourceTitle: 'X', views: 4, videoId: '1' }
            ]);

            const snapshots = [
                { version: 1, timestamp: 100 },
                { version: 2, timestamp: 200 }
            ];

            const delta = await TrafficDeltaService.calculateVersionDelta(currentSources, 2, snapshots as any);

            // 10 - 4 = 6
            expect(delta[0].views).toBe(6);
        });

        // Новый тест для восстановленных версий
        it('должен использовать closingSnapshotId для восстановленных версий', async () => {
            const { TrafficSnapshotService } = await import('./TrafficSnapshotService');

            // Мокаем данные из закрывающего снапшота (v.3 с 8 просмотрами)
            (TrafficSnapshotService.getVersionSources as any).mockResolvedValue([
                { sourceTitle: 'X', views: 8, videoId: '1' }
            ]);

            const snapshots = [
                { id: 'snap-v1', version: 1, timestamp: 100 },
                { id: 'snap-v2', version: 2, timestamp: 200 },
                { id: 'snap-v3', version: 3, timestamp: 300 }
            ];

            // Восстанавливаем v.1, передаем closingSnapshotId из v.3
            const delta = await TrafficDeltaService.calculateVersionDelta(
                currentSources,
                1,
                snapshots as any,
                'snap-v3' // Закрывающий снапшот из предыдущей активной версии
            );

            // 10 - 8 = 2 (вычитаем данные из v.3, а не ищем версию < 1)
            expect(delta[0].views).toBe(2);
        });
    });
});
