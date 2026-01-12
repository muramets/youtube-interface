import { describe, it, expect } from 'vitest';
import type { PackagingVersion } from '../../../../core/utils/youtubeApi';

describe('TrafficTab - hasPreviousSnapshots logic', () => {
    /**
     * Тестируем логику определения "первой версии с данными"
     * через проверку closingSnapshotId в activePeriods
     */

    it('должен возвращать false для версии без activePeriods', () => {
        const viewingVersion = 2;
        const packagingHistory: Partial<PackagingVersion>[] = [
            {
                versionNumber: 2,
                activePeriods: undefined // Нет периодов
            }
        ];

        const currentVersionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
        const hasPreviousSnapshots = !!(currentVersionData?.activePeriods &&
            currentVersionData.activePeriods.length > 0 &&
            currentVersionData.activePeriods[currentVersionData.activePeriods.length - 1].closingSnapshotId !== null);

        expect(hasPreviousSnapshots).toBe(false);
    });

    it('должен возвращать false для первой версии с данными (closingSnapshotId === null)', () => {
        const viewingVersion = 2;
        const packagingHistory: Partial<PackagingVersion>[] = [
            {
                versionNumber: 2,
                activePeriods: [
                    { startDate: 200, endDate: null, closingSnapshotId: null } // Первая активация
                ]
            }
        ];

        const currentVersionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
        const oldestPeriod = currentVersionData!.activePeriods![currentVersionData!.activePeriods!.length - 1];
        const hasPreviousSnapshots = oldestPeriod.closingSnapshotId !== null;

        expect(hasPreviousSnapshots).toBe(false);
    });

    it('должен возвращать true для версии с предыдущими данными (closingSnapshotId !== null)', () => {
        const viewingVersion = 3;
        const packagingHistory: Partial<PackagingVersion>[] = [
            {
                versionNumber: 3,
                activePeriods: [
                    { startDate: 300, endDate: null, closingSnapshotId: 'snap-v2' } // Была закрыта v.2
                ]
            }
        ];

        const currentVersionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
        const oldestPeriod = currentVersionData!.activePeriods![currentVersionData!.activePeriods!.length - 1];
        const hasPreviousSnapshots = oldestPeriod.closingSnapshotId !== null;

        expect(hasPreviousSnapshots).toBe(true);
    });

    it('должен проверять САМЫЙ СТАРЫЙ период для версии с несколькими периодами', () => {
        const viewingVersion = 1;
        const packagingHistory: Partial<PackagingVersion>[] = [
            {
                versionNumber: 1,
                activePeriods: [
                    { startDate: 500, endDate: null, closingSnapshotId: 'snap-v3' }, // Новый период (восстановлена после v.3)
                    { startDate: 100, endDate: 200, closingSnapshotId: null } // Старый период (первая активация)
                ]
            }
        ];

        const currentVersionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
        // Берем ПОСЛЕДНИЙ элемент массива (самый старый период)
        const oldestPeriod = currentVersionData!.activePeriods![currentVersionData!.activePeriods!.length - 1];
        const hasPreviousSnapshots = oldestPeriod.closingSnapshotId !== null;

        // Должен вернуть false, т.к. первая активация была без предыдущих данных
        expect(hasPreviousSnapshots).toBe(false);
    });

    it('должен корректно работать для сценария: v.2 → v.3 → v.1', () => {
        const packagingHistory: Partial<PackagingVersion>[] = [
            {
                versionNumber: 1,
                activePeriods: [
                    { startDate: 500, endDate: null, closingSnapshotId: 'snap-v3' } // Восстановлена после v.3
                ]
            },
            {
                versionNumber: 2,
                activePeriods: [
                    { startDate: 200, endDate: 300, closingSnapshotId: null } // Первая активация
                ]
            },
            {
                versionNumber: 3,
                activePeriods: [
                    { startDate: 300, endDate: 500, closingSnapshotId: 'snap-v2' } // Активирована после v.2
                ]
            }
        ];

        // v.2 - первая версия с данными
        const v2Data = packagingHistory.find(v => v.versionNumber === 2);
        const v2OldestPeriod = v2Data!.activePeriods![v2Data!.activePeriods!.length - 1];
        expect(v2OldestPeriod.closingSnapshotId).toBe(null);

        // v.3 - есть предыдущие данные (v.2)
        const v3Data = packagingHistory.find(v => v.versionNumber === 3);
        const v3OldestPeriod = v3Data!.activePeriods![v3Data!.activePeriods!.length - 1];
        expect(v3OldestPeriod.closingSnapshotId).toBe('snap-v2');

        // v.1 - есть предыдущие данные (v.3)
        const v1Data = packagingHistory.find(v => v.versionNumber === 1);
        const v1OldestPeriod = v1Data!.activePeriods![v1Data!.activePeriods!.length - 1];
        expect(v1OldestPeriod.closingSnapshotId).toBe('snap-v3');
    });
});
