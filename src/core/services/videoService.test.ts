import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoService } from './videoService';
import * as firestoreActions from 'firebase/firestore';
import * as storageActions from './storageService';

// 1. Мокаем Firestore и Storage
vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual,
        getDocs: vi.fn(),
        deleteDoc: vi.fn(),
        writeBatch: vi.fn(() => ({
            set: vi.fn(),
            commit: vi.fn()
        })),
        doc: vi.fn(),
        db: {}
    };
});

vi.mock('./firestore', () => ({
    getCollectionRef: vi.fn(),
    getDocument: vi.fn(),
    deleteDocument: vi.fn()
}));

vi.mock('./storageService', () => ({
    deleteImageFromStorage: vi.fn(),
    deleteCsvSnapshot: vi.fn()
}));

// Мокаем SettingsService, так как он используется для очистки videoOrder
vi.mock('./settingsService', () => ({
    SettingsService: {
        fetchVideoOrder: vi.fn().mockResolvedValue([]),
        updateVideoOrder: vi.fn()
    }
}));

describe('VideoService.deleteVideo (Full Cleanup)', () => {
    const userId = 'user-1';
    const channelId = 'channel-1';
    const videoId = 'video-123';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('должен удалить ВСЕ данные: документ, обложки в Storage и трафик', async () => {
        // Подготавливаем фейковые данные видео с историей обложек
        const mockVideo = {
            id: videoId,
            customImage: `https://firebasestorage.googleapis.com/.../${videoId}/main.jpg`,
            coverHistory: [
                { url: `https://firebasestorage.googleapis.com/.../${videoId}/old.jpg` }
            ],
            packagingHistory: [
                { configurationSnapshot: { coverImage: `https://firebasestorage.googleapis.com/.../${videoId}/v1.jpg` } }
            ]
        };

        // Подготавливаем фейковые данные трафика
        const mockTrafficMainDoc = {
            id: 'main',
            data: () => ({
                snapshots: [
                    { storagePath: `traffic/${videoId}/snap1.csv` }
                ]
            })
        };

        // Настраиваем поведение моков
        const { getCollectionRef, getDocument, deleteDocument } = await import('./firestore');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(getDocument).mockResolvedValue(mockVideo as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(getCollectionRef).mockImplementation((path: string) => ({ path } as any));

        const { getDocs } = await import('firebase/firestore');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(getDocs).mockImplementation((ref: any) => {
            // Если запрашивают трафик (проверяем по замоканному пути)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (ref && ref.path && ref.path.includes('traffic')) {
                return Promise.resolve({
                    empty: false,
                    docs: [mockTrafficMainDoc]
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);
            }
            // Если запрашивают историю
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Promise.resolve({ empty: true, docs: [] } as any);
        });

        // ЗАПУСКАЕМ УДАЛЕНИЕ
        await VideoService.deleteVideo(userId, channelId, videoId);

        // --- ВЕРИФИКАЦИЯ ---

        // 1. Проверяем удаление картинок из Storage (main + history + packaging)
        // Должно быть 3 вызова (main.jpg, old.jpg, v1.jpg)
        expect(storageActions.deleteImageFromStorage).toHaveBeenCalledTimes(3);
        expect(storageActions.deleteImageFromStorage).toHaveBeenCalledWith(mockVideo.customImage);

        // 2. Проверяем удаление CSV файлов трафика из Storage
        expect(storageActions.deleteCsvSnapshot).toHaveBeenCalledWith(`traffic/${videoId}/snap1.csv`);

        // 3. Проверяем удаление документов трафика из Firestore
        expect(firestoreActions.deleteDoc).toHaveBeenCalled();

        // 4. Проверяем удаление самого документа видео
        expect(deleteDocument).toHaveBeenCalledWith(expect.stringContaining('videos'), videoId);
    });
});
