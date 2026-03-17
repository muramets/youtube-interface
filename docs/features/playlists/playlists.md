# Playlists

## Что это

Страница управления плейлистами — создание, редактирование, удаление, группировка и drag-and-drop сортировка. Пользователь организует видео в плейлисты, плейлисты — в группы, и управляет порядком через перетаскивание.

## Текущее состояние ← YOU ARE HERE

- CRUD плейлистов (создание, редактирование, удаление с умной очисткой orphan-видео)
- Группировка плейлистов (создание/переименование/удаление групп)
- DnD: перенос плейлистов между группами, reorder внутри группы, reorder групп
- Сортировка: manual (default), по просмотрам, по дате обновления, по дате создания
- Auto-switch: при drag в sorted-режиме автоматически переключается в manual с нормализацией порядка
- Cross-playlist video selection (выделение видео через несколько плейлистов)
- Collapsed groups persistence (localStorage)
- DnD рефакторинг завершён: `useReducer`, stable callbacks, throttling, crash fix (React #185)

## User Flow

1. Пользователь открывает /playlists → видит плейлисты, сгруппированные по папкам
2. Может перетаскивать плейлисты между группами и менять порядок внутри группы
3. Может перетаскивать группы для изменения их порядка
4. Контекстное меню: Edit, Delete
5. Кнопки вверху: Add Group, Add Content, Sort dropdown
6. Все записи в Firestore происходят только при "отпускании" (drag end), не во время перетаскивания

## Roadmap

### Stage 1 — Базовый функционал ✅
- [x] CRUD плейлистов
- [x] Группировка
- [x] DnD (drag-and-drop)
- [x] Сортировка

### Stage 2 — DnD Refactoring ✅
- [x] `useReducer` для DnD state management (единый источник правды)
- [x] Устранение crash при быстром cross-group переносе (React error #185)
- [x] Extraction: reducer, utils, types в отдельные файлы
- [x] Throttling cross-group moves (50ms)
- [x] Stable callback references (stateRef pattern)
- [x] Убраны side effects из setState updaters

### Stage 3 — Market-Ready ← YOU ARE HERE
- [ ] Batch operations (multi-select + move to group)
- [ ] Playlist templates
- [ ] Keyboard shortcuts for DnD
- [ ] Undo/redo for drag operations

## Technical Implementation

### Ключевые файлы

```
src/pages/Playlists/PlaylistsPage.tsx       — страница, DndContext, SortableContext
src/features/Playlists/
  components/PlaylistGroup.tsx              — группа плейлистов, sortable wrapper
  components/PlaylistCard.tsx               — карточка плейлиста
  hooks/usePlaylistDnD.ts                   — DnD orchestrator (useReducer + handlers)
  hooks/usePlaylistsGrouping.ts             — группировка + сортировка
  hooks/dnd/types.ts                        — типы DnD state и actions
  hooks/dnd/reducer.ts                      — чистый reducer для DnD state transitions
  hooks/dnd/utils.ts                        — pure utility functions
  modals/PlaylistEditModal.tsx              — модалка редактирования
  modals/GroupSettingsModal.tsx              — модалка настроек группы
src/core/hooks/usePlaylists.ts              — data access (TanStack Query + Firestore)
src/core/services/playlistService.ts        — Firestore operations
```

### DnD Architecture

- **State**: `useReducer(dndReducer)` — единый источник правды для optimistic UI во время drag
- **Sync**: `useLayoutEffect` синхронизирует с Firestore snapshot'ами (skip при drag и pending writes)
- **Handlers**: `handleDragStart/Over/End` — stable callbacks через stateRef pattern
- **Persistence**: Firestore writes только в `handleDragEnd` через callback props
- **Throttling**: cross-group moves throttled на 50ms для предотвращения render cascade
- **Anti-bounce**: within-group reorder отслеживает последний ход для предотвращения осцилляций dnd-kit

### Firestore Collections

- `channels/{channelId}/playlists/{playlistId}` — документ плейлиста (`group`, `order`, `videoIds`, etc.)
- `channels/{channelId}/settings/playlists` — `groupOrder` array
