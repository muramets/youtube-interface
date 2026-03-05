# Trends — Niche System

> Система категоризации видео конкурентов по тематическим нишам.

## Что это такое

**Аналогия:** Папки для фотографий. Ты смотришь на все видео конкурентов и раскладываешь их по папкам: "Обзоры техники", "Влоги", "Shorts" и т.д. Есть общие папки (видны для всех каналов) и личные (только для одного канала).

## User Flow

1. **Создание ниши** — пользователь создаёт нишу в sidebar, задаёт имя и цвет
2. **Назначение видео** — drag-drop видео из timeline/таблицы в нишу в sidebar
3. **Фильтрация по нише** — клик на нишу в sidebar показывает только её видео
4. **Специальные фильтры**:
   - **UNASSIGNED** — видео без ниши
   - **TRASH (Untracked)** — скрытые видео (корзина)
5. **Нишу можно** — переименовать, изменить цвет, удалить, split, merge

## Два типа ниш

### Global (кросс-канальные)
- Видны при просмотре любого канала и в режиме "All Channels"
- Пример: "Shorts" — эта категория актуальна для всех конкурентов
- Создаются когда `selectedChannelId = null` (All Channels) или через merge

### Local (канал-специфичные)
- Видны только при просмотре конкретного канала
- Пример: "Серия интервью" — актуально только для одного канала
- Привязаны к `channelId`

## Split / Merge

### Split (Global → Local)
Разделяет глобальную нишу на несколько локальных:
- Для каждого канала, у которого есть видео в этой нише, создаётся отдельная локальная ниша с тем же именем
- Оригинальная глобальная ниша удаляется
- Видео автоматически переназначаются в соответствующие локальные ниши

### Merge (Local → Global)
Объединяет локальные ниши с одинаковым именем в одну глобальную:
- Создаётся новая глобальная ниша
- Все видео из исходных локальных ниш переназначаются в неё
- Исходные локальные ниши удаляются

## Hidden Videos (Trash)

- Видео можно "скрыть" — они попадают в корзину (Untracked в sidebar)
- Скрытые видео не отображаются в timeline/таблице в обычном режиме
- При клике на "Untracked" — показывается содержимое корзины
- Видео можно восстановить (restore) из корзины

## Drag-Drop

- **Source**: видео на timeline или в таблице (через selection + drag)
- **Target**: ниша в sidebar
- **Optimistic update**: store обновляется мгновенно, Firestore синхронизируется асинхронно
- Реализовано через `useTrendsDragDrop` hook

## Filter Persistence

Фильтры сохраняются отдельно для каждого контекста:

| Контекст | Тип сохранения | Описание |
|----------|---------------|----------|
| Channel ROOT | Auto-sync | При изменении фильтров без выбранной ниши → автосохранение в `channelRootFilters` |
| Niche filter | Manual-save | При переключении на другую нишу → ручное сохранение в `nicheFilters` |
| All Channels | Propagation | Фильтры из All Channels переносятся при drill-down (только не-niche фильтры) |

---

## Technical Implementation

### Firestore Collections

```
users/{userId}/channels/{channelId}/
  trendNiches/{nicheId}           → { name, color, type, channelId?, createdAt }
  videoNicheAssignments/{id}      → { videoId, nicheId }
  hiddenVideos/{videoId}          → { channelId, hiddenAt }
```

### Store Methods (useTrendStore)

**CRUD:**
- `addNiche(niche)` — создание ниши
- `updateNiche(id, updates)` — переименование, смена цвета
- `deleteNiche(id)` — удаление (видео становятся UNASSIGNED)
- `assignVideoToNiche(videoId, nicheId)` — назначение
- `removeVideoFromNiche(videoId)` — отвязка

**Split / Merge:**
- `splitNicheToLocal(nicheId)` — global → multiple local
- `mergeNichesToGlobal(nicheIds, name)` — multiple local → single global

**Hidden:**
- `hideVideos(videoIds)` — в корзину
- `restoreVideos(videoIds)` — из корзины

### Service Methods (TrendService)

- `subscribeToNiches()` — real-time Firestore subscription
- `subscribeToNicheAssignments()` — real-time assignments
- `subscribeToHiddenVideos()` — real-time hidden videos
- `batchAddNiches()`, `batchDeleteNiches()` — batch operations
- `migrateNicheAssignments()` — переназначение при merge
- `reassignVideosByChannel()` — переназначение при split

### Sidebar Components

| Компонент | Назначение |
|-----------|-----------|
| `TrendsSidebarSection` | Главный sidebar с каналами и нишами |
| `TrendsChannelItem` | Элемент канала с аватаром и меню |
| `TrendNicheItem` | Элемент ниши (drag target) |
| `CollapsibleNicheList` | Раскрываемый список ниш per-channel |
| `NicheContextMenu` | Контекстное меню (edit, delete, split, merge) |
| `AddChannelModal` | Модалка добавления канала |
| `CopyChannelModal` | Копирование каналов с опциональным копированием ниш |

### Color Palettes

- `MANUAL_NICHE_PALETTE` — 25+ приглушённых цветов для ручного создания
- `AUTO_NICHE_PALETTE` — 60+ ярких цветов для автогенерации
