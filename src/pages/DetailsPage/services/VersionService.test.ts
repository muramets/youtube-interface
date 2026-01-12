import { describe, it, expect } from 'vitest';
import { VersionService } from './VersionService';
import type { VideoDetails, PackagingVersion } from '../../../core/utils/youtubeApi';

describe('VersionService', () => {

    // Группа тестов для "Черновиков" (Draft)
    // Мы проверяем, понимает ли система, что в текущих данных видео есть отличия от сохраненной версии
    describe('computeDraftState', () => {
        const mockVideo: VideoDetails = {
            id: '123',
            title: 'Название 1',
            description: 'Описание 1',
            tags: ['тег1'],
            customImage: 'image1.jpg',
            channelId: 'ch1',
            channelTitle: 'Channel',
            channelAvatar: '',
            publishedAt: '',
            thumbnail: ''
        };

        it('должен возвращать true, если истории версий еще нет (это наше первое видео)', () => {
            const hasDraft = VersionService.computeDraftState(mockVideo, []);
            expect(hasDraft).toBe(true);
        });

        it('должен возвращать false, если данные видео полностью совпадают с последней версией', () => {
            const history: PackagingVersion[] = [{
                versionNumber: 1,
                startDate: 100,
                checkins: [],
                configurationSnapshot: {
                    title: 'Название 1',
                    description: 'Описание 1',
                    tags: ['тег1'],
                    coverImage: 'image1.jpg'
                },
                endDate: null,
                revision: 1
            }];

            const hasDraft = VersionService.computeDraftState(mockVideo, history);
            expect(hasDraft).toBe(false);
        });

        it('должен возвращать true, если заголовок изменился относительно последней версии', () => {
            const history: PackagingVersion[] = [{
                versionNumber: 1,
                startDate: 100,
                checkins: [],
                configurationSnapshot: {
                    title: 'Старое название',
                    description: 'Описание 1',
                    tags: ['тег1'],
                    coverImage: 'image1.jpg'
                },
                endDate: null,
                revision: 1
            }];

            const hasDraft = VersionService.computeDraftState(mockVideo, history);
            expect(hasDraft).toBe(true);
        });
    });

    // Группа тестов для удаления версий
    // Проверяем, что при удалении правильно пересчитывается новая текущая версия и данные для отката
    describe('calculateDeleteVersionData', () => {
        const history: PackagingVersion[] = [
            {
                versionNumber: 1,
                startDate: 100,
                checkins: [],
                configurationSnapshot: { title: 'V1', description: '', tags: [], coverImage: '' },
                endDate: null,
                revision: 1
            },
            {
                versionNumber: 2,
                startDate: 200,
                checkins: [],
                configurationSnapshot: { title: 'V2', description: '', tags: [], coverImage: '' },
                endDate: null,
                revision: 1
            }
        ];

        it('должен корректно удалять версию и предлагать данные предыдущей версии для отката', () => {
            // Удаляем активную версию v.2
            const result = VersionService.calculateDeleteVersionData([2], history, 2);

            // Ожидаем, что в истории осталась только v.1
            expect(result.updatedHistory.length).toBe(1);
            expect(result.updatedHistory[0].versionNumber).toBe(1);

            // Следующая версия должна быть v.2 (т.к. мы удалили старую v.2)
            expect(result.newCurrentVersion).toBe(2);

            // Данные видео должны откатиться к заголовку "V1" (из снапшота первой версии)
            expect(result.rollbackUpdates.title).toBe('V1');
        });

        it('если удаляем все версии, должен предложить начать с v.1 и выставить флаг draft', () => {
            const result = VersionService.calculateDeleteVersionData([1, 2], history, 2);

            expect(result.updatedHistory.length).toBe(0);
            expect(result.newCurrentVersion).toBe(1);
            expect(result.willHaveDraft).toBe(true);
        });
    });

    // Группа тестов для управления периодами (срабатывает при сохранении/переключении версий)
    describe('Period Management', () => {
        const mockVersion: PackagingVersion = {
            versionNumber: 1,
            startDate: 100,
            checkins: [],
            configurationSnapshot: { title: 'V1', description: '', tags: [], coverImage: '' },
            activePeriods: [{ startDate: 100, endDate: null, closingSnapshotId: null }],
            endDate: null,
            revision: 1
        };

        it('closeAllPeriods должен устанавливать endDate для всех открытых периодов', () => {
            const closed = VersionService.closeAllPeriods(mockVersion, 'snap-123');

            expect(closed.activePeriods![0].endDate).not.toBeNull();
            expect(closed.activePeriods![0].closingSnapshotId).toBe('snap-123');
            expect(closed.endDate).not.toBeNull();
        });

        it('addNewActivePeriod должен добавлять новый открытый период в начало списка', () => {
            const withNew = VersionService.addNewActivePeriod(mockVersion);

            // Было 1 период, стало 2
            expect(withNew.activePeriods?.length).toBe(2);
            // Новый период должен быть открытым (endDate === null)
            expect(withNew.activePeriods![0].endDate).toBeNull();
            // Дата начала нового периода должна быть свежей
            expect(withNew.activePeriods![0].startDate).toBeGreaterThan(100);
        });
    });
});
