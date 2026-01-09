import { TrafficDataService } from './TrafficDataService';
import { TrafficSnapshotService } from './TrafficSnapshotService';
import { TrafficDeltaService } from './TrafficDeltaService';

/**
 * Facade для TrafficService.
 * Обеспечивает обратную совместимость со старым API,
 * делегируя вызовы специализированным сервисам.
 */
export const TrafficService = {
    // TrafficDataService methods
    fetchTrafficData: TrafficDataService.fetch,
    saveTrafficData: TrafficDataService.save,
    mergeTrafficData: TrafficDataService.merge,
    clearCurrentTrafficData: TrafficDataService.clear,
    sanitizeData: TrafficDataService.sanitize,

    // TrafficSnapshotService methods
    createVersionSnapshot: TrafficSnapshotService.create,
    getVersionSources: TrafficSnapshotService.getVersionSources,
    deleteSnapshot: TrafficSnapshotService.delete,

    // TrafficDeltaService methods
    calculateVersionDelta: TrafficDeltaService.calculateVersionDelta
};

// Re-export individual services for direct access
export { TrafficDataService } from './TrafficDataService';
export { TrafficSnapshotService } from './TrafficSnapshotService';
export { TrafficDeltaService } from './TrafficDeltaService';
