import type { TrafficSource, TrafficSnapshot } from '../../types/traffic';

/**
 * Сервис для расчета дельты трафика между версиями.
 * Вычисляет разницу в просмотрах, показах и времени просмотра.
 */
export const TrafficDeltaService = {
    /**
     * Вычисляет разницу между двумя наборами источников.
     * Generic метод для использования в разных контекстах.
     */
    calculateSourcesDelta(
        currentSources: TrafficSource[],
        prevSources: TrafficSource[]
    ): TrafficSource[] {
        if (prevSources.length === 0) {
            return currentSources;
        }

        // Создаем Map предыдущих данных для быстрого поиска
        const prevData = new Map<string, { views: number, impressions: number, watchTime: number }>();
        prevSources.forEach(s => {
            if (s.videoId) {
                prevData.set(s.videoId, {
                    views: s.views || 0,
                    impressions: s.impressions || 0,
                    watchTime: s.watchTimeHours || 0
                });
            }
        });

        // Вычисляем дельту для каждого источника
        return currentSources
            .map(source => {
                if (!source.videoId) return source;

                const prev = prevData.get(source.videoId) || { views: 0, impressions: 0, watchTime: 0 };
                const viewsDelta = Math.max(0, source.views - prev.views);
                const impressionsDelta = Math.max(0, (source.impressions || 0) - prev.impressions);
                const watchTimeDelta = Math.max(0, (source.watchTimeHours || 0) - prev.watchTime);

                // Пересчитываем CTR на основе дельты
                const ctrDelta = impressionsDelta > 0 ? (viewsDelta / impressionsDelta) * 100 : 0;

                return {
                    ...source,
                    views: viewsDelta,
                    impressions: impressionsDelta,
                    watchTimeHours: watchTimeDelta,
                    ctr: parseFloat(ctrDelta.toFixed(2))
                };
            })
            .filter(source => !source.videoId || source.views > 0);
    },

    /**
     * Рассчитывает дельту трафика для конкретной версии.
     * Вычитает данные предыдущего снапшота из текущих данных.
     */
    async calculateVersionDelta(
        currentSources: TrafficSource[],
        version: number,
        snapshots: TrafficSnapshot[]
    ): Promise<TrafficSource[]> {
        // Находим предыдущую версию (максимальная версия < current)
        // Это более надежно чем version - 1, т.к. версии могут быть пропущены
        const previousVersions = snapshots
            .map(s => s.version)
            .filter(v => v < version)
            .sort((a, b) => b - a); // Descending

        const prevVersion = previousVersions[0];

        if (prevVersion === undefined) {
            return currentSources; // Нет предыдущих версий
        }

        // Загружаем данные предыдущей версии через сервис (поддержка storage/legacy)
        const { TrafficSnapshotService } = await import('./TrafficSnapshotService');
        const prevSources = await TrafficSnapshotService.getVersionSources(prevVersion, snapshots);

        return this.calculateSourcesDelta(currentSources, prevSources);
    }
};
