import type { TrafficSource, TrafficSnapshot } from '../../types/traffic';

/**
 * Сервис для расчета дельты трафика между версиями.
 * Вычисляет разницу в просмотрах, показах и времени просмотра.
 */
export const TrafficDeltaService = {
    /**
     * Рассчитывает дельту трафика для конкретной версии.
     * Вычитает данные предыдущего снапшота из текущих данных.
     */
    calculateVersionDelta(
        currentSources: TrafficSource[],
        version: number,
        snapshots: TrafficSnapshot[]
    ): TrafficSource[] {
        // Находим снапшот предыдущей версии
        const prevSnapshot = snapshots.find(s => s.version === version - 1);
        if (!prevSnapshot || !prevSnapshot.sources) {
            return currentSources; // Нет предыдущих данных или данные в Storage
        }

        // Создаем Map предыдущих данных для быстрого поиска
        const prevData = new Map<string, { views: number, impressions: number, watchTime: number }>();
        prevSnapshot.sources.forEach(s => {
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
    }
};
