import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoCard } from './VideoCard';
import { BrowserRouter } from 'react-router-dom';

// 1. Мокаем внешние зависимости, которые использует VideoCard
// Это нужно, чтобы тест не упал из-за отсутствия контекста (API, Auth, Stores)
vi.mock('../../core/hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'test-user' } })
}));

vi.mock('../../core/stores/channelStore', () => ({
    useChannelStore: (selector: any) => selector({ currentChannel: { id: 'test-channel' } })
}));

vi.mock('../../core/stores/uiStore', () => ({
    useUIStore: () => ({
        videoViewModes: {},
        setVideoViewMode: vi.fn(),
        setSettingsOpen: vi.fn()
    })
}));

vi.mock('../../core/hooks/useSettings', () => ({
    useSettings: () => ({ generalSettings: { apiKey: 'test-api-key' } })
}));

// Простой мок для хуков, которые нам не важны в этом тесте
vi.mock('../../core/hooks/useVideoSync', () => ({ useVideoSync: () => ({ syncVideo: vi.fn() }) }));
vi.mock('../../core/hooks/usePlaylists', () => ({ usePlaylists: () => ({ removeVideosFromPlaylist: vi.fn() }) }));
vi.mock('../../core/hooks/useThumbnailActions', () => ({ useThumbnailActions: () => ({ handleLikeThumbnail: vi.fn(), handleRemoveThumbnail: vi.fn() }) }));

describe('VideoCard', () => {
    const mockVideo = {
        id: 'video-123',
        title: 'Тестовое видео',
        thumbnail: 'test.jpg',
        channelId: 'ch1',
        channelTitle: 'Test Channel',
        channelAvatar: 'avatar.jpg',
        publishedAt: new Date().toISOString(),
        viewCount: '1000'
    };

    const mockOnRemove = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('должен вызывать onRemove после подтверждения удаления в меню', async () => {
        // Рендерим карточку видео
        render(
            <BrowserRouter>
                <VideoCard video={mockVideo as any} onRemove={mockOnRemove} />
            </BrowserRouter>
        );

        // 1. Находим кнопку "три точки" (More) и кликаем по ней
        // В компоненте это кнопка с иконкой MoreVertical
        const moreButton = screen.getByRole('button', { name: '' }); // Кнопка меню
        fireEvent.click(moreButton);

        // 2. Находим пункт "Delete" в выпадающем меню и кликаем
        const deleteOption = screen.getByText('Delete');
        fireEvent.click(deleteOption);

        // 3. Должно появиться модальное окно подтверждения
        expect(screen.getByText('Are you sure you want to delete this video?')).toBeInTheDocument();

        // 4. Находим кнопку "Confirm" в модалке и кликаем
        const confirmButton = screen.getByText('Confirm');
        fireEvent.click(confirmButton);

        // 5. Проверяем, что функция удаления была вызвана с ПРАВИЛЬНЫМ ID видео
        expect(mockOnRemove).toHaveBeenCalledWith('video-123');
    });
});
