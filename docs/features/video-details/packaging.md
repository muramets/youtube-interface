# Packaging — Feature Doc

## Текущее состояние

**Полностью реализован.** Packaging — основной таб Video Details page. Форма редактирования упаковки видео: title, description, tags, thumbnail с историей версий. A/B тестирование заголовков и превью (до 3 вариантов, watch time share %). Система версионирования с draft/save/restore/delete и привязкой к traffic snapshots. Мультиязычная локализация (LanguageTabs). Clone-to-preview для A/B вариантов. Auto-save metadata полей (publishedUrl, videoRender, audioRender).

**Известный пробел:** A/B тест данные (titles, thumbnails, results) **не передаются** в AI Chat Assistant — ни через persistent context, ни через tool `getMultipleVideoDetails`.

---

## Что это

Рабочее пространство для **упаковки видео** — всё, что зритель видит до клика: заголовок, превью, описание, теги. Пользователь создаёт и итерирует варианты упаковки, сохраняет версии, проводит A/B тесты через YouTube, фиксирует результаты.

**Ключевой вопрос, на который отвечает:** *"Какая комбинация заголовка и превью даёт лучший CTR? Как менялась упаковка от версии к версии, и какой вариант победил в A/B тесте?"*

### Video Details Page — общая структура

Video Details — страница с 5 табами, Packaging — первый и основной:

| Таб | Что делает | Feature Doc |
|-----|-----------|-------------|
| **Packaging** | Редактирование упаковки + версии + A/B тесты | этот документ |
| **Traffic Sources** | Откуда приходит трафик (CSV upload, timeline) | [traffic-sources.md](../video-details/traffic-sources.md) |
| **Suggested Traffic** | Рядом с какими видео рекомендуют (CSV, enrichment, AI) | [suggested-traffic/](../video-details/suggested-traffic/README.md) |
| **Gallery** | Референсы, скриншоты, источники вдохновения | нет docs |
| **Editing** | Timeline-редактор видео (ffmpeg render pipeline) | нет docs |

Sidebar слева — общий для всех табов: версии (Packaging), snapshots (Traffic/TrafficSource), sources (Gallery).

---

## User Flow

### Базовый сценарий (создание упаковки)

1. Пользователь создаёт видео → попадает в Packaging tab (Draft)
2. Заполняет title, description, tags, загружает thumbnail
3. Нажимает **"Save as v.1"** → создаётся первая версия с configuration snapshot
4. Публикует видео на YouTube, вставляет ссылку в "Published URL" (auto-save)
5. Через неделю решает поменять превью → редактирует → **"Save as v.2"**
6. При создании v.2 система спрашивает: *"Upload traffic snapshot before switching?"* — чтобы зафиксировать метрики текущей версии

### A/B тестирование

1. На Packaging tab пользователь нажимает кнопку A/B рядом с title или thumbnail
2. Открывается **ABTestingModal** — 3 режима: Title only, Thumbnail only, Title + Thumbnail
3. До 3 вариантов на каждый аспект (minimum 2 для теста)
4. Пользователь запускает тест в YouTube Studio (вне приложения)
5. Возвращается и вводит **watch time share %** для каждого варианта
6. Система определяет Winner / So-so / Loser (цветовые бейджи: зелёный / оранжевый / красный)
7. Из модалки можно **Clone** вариант — создаёт preview card для дальнейшего использования

### Версионирование

- **Draft** — текущие несохранённые изменения. Кнопки: "Undo changes", "Save as draft", "Save as v.N"
- **Version (v.1, v.2...)** — сохранённый snapshot упаковки (title, description, tags, cover, A/B данные, localizations)
- **Active version** — текущая "живая" версия (показывается первой в sidebar)
- **Restore** — при просмотре старой версии кнопка "Restore this version" делает её активной заново (новый active period, не перезапись)
- **Delete** — удаляет версию + все клоны. Если есть traffic snapshots — packaging данные сохраняются внутри traffic snapshot (packagingSnapshot) перед удалением
- **Active Periods** — версия может быть активирована несколько раз (restore). Каждый период = отрезок времени с привязанными traffic snapshots

### Локализация

- LanguageTabs над формой (только для custom видео)
- Default + N дополнительных языков
- Каждый язык имеет свои title, description, tags
- Сохраняется в `localizations` как Record<langCode, VideoLocalization>

### Thumbnail история

- При замене thumbnail старый автоматически попадает в cover history
- History отображается в ThumbnailSection с версионированием (v.1, v.2...)
- Можно "лайкнуть" (pin) или удалить thumbnail из истории
- Restore из истории устанавливает конкретную версию и filename

---

## Что улетает в Chat — и чего НЕ хватает

### Persistent Context (system prompt)

Через `videoToCardContext()` → `formatSingleVideo()`:

**Передаётся:** `title`, `description`, `tags`, `thumbnailUrl`, `viewCount`, `publishedAt`, `duration`, `delta24h/7d/30d`

**НЕ передаётся:** `abTestTitles`, `abTestThumbnails`, `abTestResults`, `packagingHistory`, `localizations`, `coverHistory`

### Tool `getMultipleVideoDetails`

Через `formatVideoData()`:

**Передаётся:** `videoId`, `title`, `description`, `tags`, `ownership`, `channelTitle`, `viewCount`, `likeCount`, `publishedAt`, `duration`, `thumbnailUrl`

**НЕ передаётся:** `abTestTitles`, `abTestThumbnails`, `abTestResults`, `packagingHistory`, `localizations`

### Что нужно для AI-интеграции

Чтобы AI мог анализировать A/B тесты и историю упаковки:

1. Расширить `VideoCardContext` + `videoToCardContext()` — добавить A/B поля
2. Обновить `formatSingleVideo()` — форматировать A/B данные для system prompt
3. Обновить `formatVideoData()` в tool handler — пробросить A/B данные (только для own-видео)
4. Опционально: создать dedicated tool `getPackagingHistory` для deep analysis версий

---

## Roadmap

### Stage 1 — Form + Versions ✅
- [x] PackagingForm: title, description, tags, thumbnail upload
- [x] Version management: create, restore, delete, draft
- [x] Configuration snapshots (PackagingSnapshot)
- [x] Active Periods для multi-restore
- [x] Version numbering (visual vs internal, clone support)
- [x] Dirty tracking + unsaved changes guard (tab switch, beforeunload)
- [x] Auto-save metadata (publishedUrl, videoRender, audioRender)

### Stage 2 — A/B Testing ✅
- [x] ABTestingModal: 3 режима (title / thumbnail / both)
- [x] До 3 вариантов на аспект
- [x] Watch time share % input (SmartPercentageInput)
- [x] Ranking: Winner / So-so / Loser (ABTestRank)
- [x] Background save для results-only changes (не создаёт draft)
- [x] Clone-to-preview из A/B вариантов

### Stage 3 — Localization ✅
- [x] LanguageTabs с переключением языков
- [x] Per-language title, description, tags
- [x] Custom languages (сохраняются per channel)
- [x] Unsaved changes confirmation при смене языка

### Stage 4 — Thumbnail History ✅
- [x] Auto-push старого thumbnail в историю при замене
- [x] Cover history с версионированием
- [x] Like/remove для thumbnails
- [x] Restore thumbnail из истории
- [x] Clone from history version

### Stage 5 — Localization & UX Polish ← YOU ARE HERE
- [ ] **Primary language**: если заполнена не-ENG локализация — она открывается по умолчанию; ENG не показывается, пока не добавлена явно как локализация. Сейчас ENG hardcoded как primary tab в LanguageTabs
- [ ] **Shared tags**: поле tags общее для всех локализаций (сейчас tags сохраняются per-language при переключении)
- [ ] **Draft warning**: заметный, но ненавязчивый banner/warning в интерфейсе, если видео в статусе Draft — напоминание прикрепить Published URL после публикации на YouTube

### Stage 6 — AI Integration
A/B тест данные и packaging history доступны AI-ассистенту.
- [ ] Расширить `VideoCardContext` A/B полями
- [ ] Обновить `videoToCardContext()` адаптер
- [ ] Обновить `formatSingleVideo()` в persistent context layer
- [ ] Обновить `formatVideoData()` в `getMultipleVideoDetails` handler
- [ ] Опционально: dedicated tool `getPackagingHistory` (версии + A/B + localizations)

### Production
**User flow:** Пользователь создаёт видео, итерирует упаковку через версии. Проводит A/B тест (3 варианта thumbnail). Фиксирует результаты (Winner 45%, So-so 30%, Loser 25%). AI анализирует: *"В A/B тесте v.2 вариант с крупным лицом показал 45% watch time share — попробуй этот паттерн в следующем видео."* AI видит историю версий и рекомендует, какой стиль упаковки работает лучше.

- [ ] **AI:** A/B данные в context + tool → $0 additional cost (данные уже в Firestore)
- [x] **Хранение:** Firestore (video doc: abTestTitles/Thumbnails/Results, packagingHistory), Cloud Storage (thumbnails)
- [x] **Стоимость:** Минимальная — Firestore writes + Storage uploads. Нет внешних API

---

## Связанные фичи
- [Suggested Traffic](./suggested-traffic/README.md) — snapshots привязаны к packaging versions. При удалении версии — packaging данные денормализуются в traffic snapshot
- [Traffic Sources](./traffic-sources.md) — общий sidebar с версиями
- Video Preview Card — правый sidebar: live preview упаковки (thumbnail + title + channel)
- [Chat Context Bridges](../chat/context/bridges/README.md) — `videoToCardContext()` → persistent context layer

---

## Technical Implementation

### Frontend — Packaging Tab
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Packaging/PackagingTab.tsx` | Orchestrator: form + preview + A/B modal + version loading |
| `pages/Details/tabs/Packaging/components/PackagingForm.tsx` | Главная форма: title, description, thumbnail, tags, show more |
| `pages/Details/tabs/Packaging/components/TitleInput.tsx` | Title input с кнопкой A/B |
| `pages/Details/tabs/Packaging/components/DescriptionInput.tsx` | Description textarea |
| `pages/Details/tabs/Packaging/components/TagsSection.tsx` | Tags input (chip-based) |
| `pages/Details/tabs/Packaging/components/ShowMoreSection.tsx` | Collapsible: publishedUrl, videoRender, audioRender |
| `pages/Details/tabs/Packaging/components/ABTitlesDisplay.tsx` | A/B titles с бейджами Winner/So-so/Loser |
| `pages/Details/tabs/Packaging/components/VideoPreviewCard.tsx` | Live preview карточка (правый sidebar) |

### Frontend — A/B Testing
| Файл | Назначение |
|------|-----------|
| `features/ABTesting/ABTestingModal.tsx` | Modal: 3 таба (title/thumbnail/both), 3 варианта, results, clone |
| `features/ABTesting/hooks/useABTestingModalState.ts` | Внутреннее состояние модалки (validation, save data) |
| `features/ABTesting/hooks/useABTesting.ts` | Feature-level hook (visibility, mode, props for modal) |
| `features/ABTesting/components/TitleInputCard.tsx` | Карточка ввода заголовка варианта |
| `features/ABTesting/components/ThumbnailSlot.tsx` | Слот загрузки thumbnail варианта |
| `features/ABTesting/components/ShareResultCell.tsx` | Ячейка ввода watch time share % |
| `pages/Details/tabs/Packaging/hooks/useABTesting.ts` | Tab-level A/B hook (state sync, background save, title/thumbnail change) |
| `pages/Details/tabs/Packaging/utils/abTestRank.ts` | `getABTestRank()`, `getRankBorderClass()`, `getRankBadgeProps()` |

### Frontend — Hooks
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Packaging/hooks/usePackagingFormState.ts` | Form state + dirty tracking + snapshot comparison |
| `pages/Details/tabs/Packaging/hooks/usePackagingVersions.ts` | Version reducer (create, delete, restore, switch, draft) |
| `pages/Details/tabs/Packaging/hooks/usePackagingActions.ts` | Save, save as version, clone, restore, metadata actions |
| `pages/Details/tabs/Packaging/hooks/usePackagingLocalization.ts` | Multi-language state management |
| `pages/Details/tabs/Packaging/hooks/useDirtyTracking.ts` | Dirty state comparison utility |

### Frontend — Version Management (shared across tabs)
| Файл | Назначение |
|------|-----------|
| `pages/Details/DetailsLayout.tsx` | Page orchestrator: tabs, versions, modals, traffic |
| `pages/Details/DetailsPage.tsx` | Entry point: URL params → video lookup |
| `pages/Details/services/VersionService.ts` | Pure logic: computeDraftState, calculateDeleteVersionData, prepareRestoreVersionData, period helpers |
| `pages/Details/hooks/useVersionManagement.ts` | Version click, delete, restore handlers (Firestore writes) |
| `pages/Details/hooks/useSnapshotManagement.ts` | Traffic snapshot request/upload/skip workflow |
| `pages/Details/hooks/useModalState.ts` | Modal state machine (SWITCH_CONFIRM, DELETE_CONFIRM, SNAPSHOT_REQUEST) |
| `pages/Details/components/DetailsModals.tsx` | Modal rendering orchestrator |

### Frontend — Sidebar
| Файл | Назначение |
|------|-----------|
| `pages/Details/Sidebar/DetailsSidebar.tsx` | Main sidebar: tab-dependent content |
| `pages/Details/Sidebar/Packaging/PackagingNav.tsx` | Version list in sidebar |
| `pages/Details/Sidebar/Packaging/SidebarVersionItem.tsx` | Single version item |
| `pages/Details/Sidebar/SidebarVideoPreview.tsx` | Video preview at sidebar top |

### Frontend — Types
| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Packaging/types.ts` | ABTestResults, VersionState, LoadedSnapshot, defaults |
| `core/types/versioning.ts` | PackagingSnapshot, PackagingVersion, ActivePeriod, PackagingCheckin |
| `core/utils/youtubeApi.ts` | VideoDetails (abTestTitles, abTestThumbnails, abTestResults fields) |

### AI Integration (gap)
| Файл | Что нужно изменить |
|------|-----------|
| `core/types/appContext.ts` | Расширить `VideoCardContext` A/B полями |
| `core/utils/videoAdapters.ts` | Обновить `videoToCardContext()` — пробросить A/B данные |
| `core/ai/layers/persistentContextLayer.ts` | Обновить `formatSingleVideo()` — форматировать A/B данные |
| `functions/src/services/tools/handlers/getMultipleVideoDetails.ts` | Обновить `formatVideoData()` — пробросить A/B данные для own-видео |

### Data paths
```
Firestore:  users/{uid}/channels/{channelId}/videos/{videoId}
  Fields:   title, description, tags, customImage, thumbnail,
            abTestTitles, abTestThumbnails, abTestResults,
            packagingHistory[], currentPackagingVersion, activeVersion, isDraft,
            localizations, coverHistory[], likedThumbnailVersions,
            publishedVideoId, videoRender, audioRender,
            packagingRevision (optimistic concurrency)

Storage:    users/{uid}/channels/{channelId}/videos/{videoId}/{timestamp}_{filename}
            (thumbnails + A/B test images)

URL:        /video/:channelId/:videoId/details?tab=packaging
```

### Data flow
```
Edit:
  User edits form → usePackagingLocalization (title/desc/tags per language)
    + usePackagingFormState (dirty tracking, snapshot comparison)
    → "Save as draft" → Firestore update (video fields + isDraft: true)
    → "Save as v.N" → Firestore update (video fields + packagingHistory + new version)

A/B Test:
  User clicks A/B button → ABTestingModal opens
    → User adds 2-3 variants (titles/thumbnails)
    → "Save" → useABTesting.saveChanges() → packaging dirty state
    → Later: user enters results → background save (onResultsSave) → direct Firestore update

Version Switch:
  User clicks version in sidebar → useVersionManagement.handleVersionClick()
    → If dirty: SWITCH_CONFIRM modal → Save/Discard/Cancel
    → Load configurationSnapshot → formState.resetToSnapshot()

Version Delete:
  User deletes version → DELETE_CONFIRM modal (shows snapshot count + views)
    → VersionService.calculateDeleteVersionData() → atomic batch:
      1. Traffic snapshots get packagingSnapshot embedded (denormalization)
      2. Video doc updated (history, rollback to previous version)
```
