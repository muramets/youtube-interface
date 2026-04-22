# User Channels

## Что это

Канал — центральная единица организации данных в приложении. Каждый пользователь может создать несколько каналов, и **все данные** (видео, плейлисты, музыка, тренды, canvas-страницы, настройки) привязаны к конкретному каналу. Переключение канала = переключение всего контекста работы.

Аналогия: канал — это как отдельный рабочий стол на компьютере. У каждого свои файлы, обои и настройки. Переключил — и ты в другом мире.

## Текущее состояние

← YOU ARE HERE → **Stage 1 — Base multi-channel**

- Пользователь создаёт каналы через модалку (имя + аватар)
- Переключение каналов через dropdown в header
- Каждый канал хранит независимые данные: видео, плейлисты, музыку, тренды, canvas, настройки
- Per-channel кастомизация: целевые ниши (max 2), кастомные языки
- При переключении канала: синхронно очищается старый стейт, подписки переключаются на новый канал
- Удаление канала каскадно удаляет все подколлекции (videos, playlists, settings)
- Пользователь вручную задаёт порядок каналов в dropdown через drag-and-drop (персонально для каждого юзера, сохраняется в Firestore)
- В модалке настроек канала (EditChannelModal) есть секция Target Niches со списком привязанных ниш и кнопкой удаления; добавление таргета по-прежнему делается через контекстное меню ниши в Trends sidebar
- При переключении user-канала текущий trends-контекст (активные фильтры, выбранный trendChannel, timeline config) сохраняется как per-user-channel snapshot и восстанавливается при возврате — бесшовный UX, фильтры не теряются

## User Flow

1. **Первый вход** → `ChannelSelectorModal` предлагает создать канал или импортировать YouTube-канал
2. **Создание канала** → `CreateChannelModal`: ввод имени, drag-and-drop аватара (resize до 400px)
3. **Работа** → Все разделы (Home, Trends, Music, Playlists, Canvas, Chat) работают в контексте текущего канала
4. **Переключение** → `ChannelDropdown` в header: клик по другому каналу → моментальная смена контекста
5. **Редактирование** → `EditChannelModal`: изменение имени/аватара, удаление канала с подтверждением
6. **Настройки** → Каждый канал имеет независимые настройки (тема, auto-sync, packaging defaults и др.)
7. **Переупорядочивание** → В `ChannelDropdown` юзер хватает канал за drag-handle (иконка grip-vertical слева, появляется при наведении), перетаскивает вверх/вниз — новый порядок мгновенно виден в UI и сохраняется в Firestore. Порядок персональный (живёт в документе канала юзера, который уже привязан к `users/{uid}`).

## Архитектура изоляции данных

Канал — это namespace. Всё, что создаёт пользователь, живёт внутри канала:

| Данные | Подколлекция | Описание |
|--------|-------------|----------|
| Видео | `videos/` | Проекты видео со всеми вкладками (editing, packaging, gallery, traffic) |
| Плейлисты | `playlists/` | Организация видео в плейлисты |
| Музыка | `tracks/`, `musicPlaylists/` | Аудиотреки и музыкальные плейлисты |
| Тренды | `trends/` | Ниши, тренд-видео, assignments |
| Canvas | `canvas/` | Визуальный редактор страниц с нодами |
| Настройки | `settings/` | 10 документов: general, sync, clone, packaging и др. |
| Chat Attachments | `chatAttachments/` | Файлы, прикреплённые к AI-чату |
| Traffic | `traffic/`, `video_reactions/` | Снэпшоты трафика и suggested traffic |

## Процесс переключения канала

Критически важный flow — при переключении нельзя допустить "мерцание" данных старого канала:

1. **Save trends snapshot** — текущие trends-фильтры, selectedChannelId, timelineConfig уходят в `trendsSnapshotsByUserChannel[oldUserChannelId]`
2. **Синхронная очистка эпhemeral data** — videos/channels/niches/assignments/hiddenVideos обнуляются до смены канала
3. **Стоп аудиоплеера** — музыкальные треки привязаны к каналу
4. **Смена currentChannel** — Zustand store обновляется, localStorage сохраняет выбор
5. **Restore trends snapshot** — из `trendsSnapshotsByUserChannel[newUserChannelId]` или defaults, если user-channel посещается впервые
6. **Навигация на Home** — предотвращает показ страницы с несуществующими данными
7. **Filter sync** — `useFilterChannelSync` сохраняет фильтры старого канала, загружает фильтры нового
8. **Подписки обновляются** — TanStack Query + Firestore onSnapshot переподключаются к новому каналу

## Roadmap

### Stage 2 — YouTube Integration
- Привязка реального YouTube-канала к app-каналу (YouTube Channel ID)
- Синхронизация метаданных (имя, аватар, подписчики) с YouTube API
- Автоматический импорт видео с YouTube

### Stage 3 — Team Collaboration
- Приглашение других пользователей в канал (role-based: owner, editor, viewer)
- Shared доступ к видео, плейлистам и настройкам

### Stage 4 — Channel Analytics Dashboard
- Агрегированная статистика по каналу (total views, growth trends)
- Сравнение перформанса между каналами пользователя

---

## Technical Implementation

### Firestore Structure

```
users/{userId}/
  channels/{channelId}/           ← документ канала (name, avatar, niches, languages)
    videos/{videoId}/             ← видео-проекты
    playlists/{playlistId}/       ← плейлисты
    tracks/{trackId}/             ← музыкальные треки
    musicPlaylists/{id}/          ← музыкальные плейлисты
    settings/{settingType}/       ← настройки (general, sync, clone, packaging, etc.)
    trends/niches/{nicheId}/      ← тренд-ниши
    trends/videos/{videoId}/      ← тренд-видео
    canvas/{pageId}/nodes/{id}/   ← canvas-ноды
    chatAttachments/{convId}/     ← чат-аттачменты
    traffic/                      ← traffic snapshots
    video_reactions/              ← suggested traffic
```

### Channel Data Model

```typescript
interface Channel {
    id: string;                          // Firestore auto-ID
    name: string;                        // Display name
    avatar?: string;                     // Base64 resized image
    createdAt: number;                   // Date.now() timestamp
    customLanguages?: CustomLanguage[];  // Per-channel language overrides
    targetNicheIds?: string[];           // Trend niche targets (max 2)
    targetNicheNames?: string[];         // Cached niche names for cross-channel display
    order?: number;                      // User-defined position in ChannelDropdown (absent until first reorder)
}
```

### Reorder Mechanics

- **DnD library:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` (тот же набор, что в `CTRRulesList`).
- **Sort order:** `compareChannels` сравнивает по `order` если оба канала его имеют; каналы с `order` всегда впереди тех, у кого его нет; при отсутствии `order` у обоих — fallback на `createdAt`. После первого drag все каналы получают `order` в одном `writeBatch` (`ChannelService.reorderChannels`), дальше сортировка всегда детерминированная.
- **Optimistic update:** `handleDragEnd` в `ChannelDropdown` сразу обновляет `queryClient.setQueryData(['channels', userId], reordered)`, чтобы UI не ждал Firestore. При ошибке `writeBatch` — откат к прежнему массиву, `onSnapshot` синхронизирует правду.
- **Drag handle:** иконка `GripVertical` отображается только при `channels.length > 1` и появляется на hover (`group-hover:opacity-100`). `PointerSensor` с `activationConstraint: { distance: 3 }` отделяет клик (switch) от перетаскивания.

### Key Files

| File | Назначение |
|------|-----------|
| `src/core/services/channelService.ts` | Firestore CRUD операции |
| `src/core/stores/channelStore.ts` | Zustand store (currentChannel + persist) |
| `src/core/hooks/useChannels.ts` | TanStack Query + real-time subscription |
| `src/core/hooks/useFilterChannelSync.ts` | Sync channelStore ↔ filterStore при переключении |
| `src/features/Profile/ChannelDropdown.tsx` | UI переключателя каналов в header |
| `src/features/Profile/modals/CreateChannelModal.tsx` | Модалка создания канала |
| `src/features/Profile/modals/EditChannelModal.tsx` | Модалка редактирования/удаления канала |
| `src/features/Profile/modals/ChannelSelectorModal.tsx` | Модалка выбора канала (первый вход + YouTube import) |

### State Management

- **channelStore** (Zustand + persist) — хранит `currentChannel` в localStorage
- **useChannels** (TanStack Query) — список каналов из Firestore с real-time подпиской
- **filterStore** — per-channel фильтры (видео, музыка, плейлисты), переключаются через `switchChannel()`
- **Не в store**: список каналов живёт только в TanStack Query cache (не дублируется в Zustand)
