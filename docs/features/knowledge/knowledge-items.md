# Knowledge Items

> Система долговременного хранения результатов AI-анализа видео и канала, доступная LLM в будущих чатах без повторного исследования.

## Текущее состояние

Реализовано полностью. LLM создаёт Knowledge Items (KI) через tool calls (`saveKnowledge`), будущие LLM обнаруживают их через денормализованные флаги на документах видео/канала и запрашивают содержимое (`listKnowledge` / `getKnowledge`). Memorize работает как последний turn чата через `aiChat` endpoint с `isConclude: true` — AI создаёт KI, затем Memory со ссылками на KI. UI: Knowledge Page — единый хаб всех KI (оба scope), multi-row фильтры (All/Channel/Videos + category chips per scope). Watch Page (video KI, таб "AI Research") — дублирует video-scoped KI в контексте конкретного видео. Edit Knowledge Item modal позволяет привязать/отвязать видео через VideoLinkField (поиск + compact preview); привязка меняет `scope` и `videoId`, discovery flags обновляются атомарно в batch. KnowledgeCard отображает content с collapsible sections и video reference tooltips. Video references используют `vid://` URI scheme: LLM пишет `[title](vid://ID)` ссылки, read-only рендерер показывает интерактивные mention-ы с tooltip, в edit mode — Tiptap Mark с `@` autocomplete для вставки ссылок на видео (свои + конкуренты). `onKnowledgeItemDeleted` Firestore trigger поддерживает целостность discovery flags.

---

## Что это такое

**Аналогия:** Врач после каждого визита записывает результаты обследования в медицинскую карту. Другой врач открывает карту — видит историю, не заставляет пациента пересдавать анализы. Knowledge Items — "медицинская карта" для видео и канала.

**Зачем:**
- AI-тулы (`analyzeTrafficSources`, `analyzeSuggestedTraffic`) генерируют 10-40K токенов. При закрытии чата эти данные теряются.
- Memory System (L4) сохраняет краткое резюме разговора (~200-500 слов), а не детальные результаты.
- KI сохраняет полные структурированные результаты анализа, переиспользуемые в будущих чатах без повторных API-вызовов.

**Два уровня:**
- **Video KI** — результаты анализа конкретного видео (трафик, suggested pool, упаковка)
- **Channel KI** — стратегические выводы о канале (journey, стратегии, рост, гипотезы)

## Отличие от Memory System

| | Memory (L4) | Knowledge Items |
|---|-------------|-----------------|
| **Цель** | "Что помнить из разговора" | "Что известно об объекте" |
| **Привязка** | К разговору (conversationId) | К видео или каналу |
| **Размер** | ~200-500 слов, сжатое | ~1000-5000 слов, структурированное |
| **Инъекция в чат** | Всегда в system prompt | По запросу через tool (discovery flags → list → get) |
| **Создание** | При Memorize (после KI) | Явная команда + при Memorize (перед Memory) |

При Memorize: AI сначала извлекает KI (`saveKnowledge` ×N), затем Memory (`saveMemory` ×1), которая ссылается на KI через `kiRefs[]` и не дублирует их содержание.

---

## User Flow: Video KI (Watch Page)

Watch Page имеет два таба: **My Notes** (ручные заметки) | **AI Research** (KI карточки).

**AI Research** показывает список KnowledgeCard для данного видео:
- **Collapsed:** категория (accent uppercase), title, summary с video reference tooltips. Chevron-indicator на hover.
- **Expanded:** meta row (model, tools, source Badge), collapsible sections (headers collapsed by default), Zen Mode button.
- **Zen Mode:** fullscreen read-only overlay (Portal, backdrop blur, ESC to close).
- **Edit:** модалка с RichTextEditor (Tiptap WYSIWYG). Провенанс (model, toolsUsed, createdAt) — read-only.

**Video reference highlighting (resolve at write, render from snapshot):**
- При сохранении KI (`saveKnowledge` handler) код извлекает video-ID-like строки из content (regex), резолвит через 3-step resolver (`videos/` → `cached_external_videos/` → `trendChannels/`), сохраняет как `resolvedVideoRefs: MemoryVideoRef[]` snapshot на KI doc. Работает для своих видео и конкурентов.
- LLM пишет `[title](vid://ID)` ссылки в content. `bodyComponents.a` рендерит их как `VideoReferenceTooltip` с hover tooltip. Для legacy KI с raw IDs `linkifyVideoRefs` конвертирует в `[title](vid://ID)` при рендере. Zero Firestore reads — данные уже на документе.
- Fallback: для legacy KI без `resolvedVideoRefs` используется `buildVideoRefMap` из `useVideos` (только свои видео).

**`knowledgeItemCount` badge:** на VideoCard (thumbnail overlay, иконка BookOpen) показывает количество KI для видео.

## User Flow: Channel KI (Knowledge Page)

Sidebar: пункт **Knowledge** (иконка BookOpen). Route: `/knowledge`.

- **Category chip-row** — фильтры по категориям (динамически из существующих KI, с count)
- **Sort toggle** — newest / oldest (PortalTooltip на hover)
- **KI cards** — тот же KnowledgeCard, что и на Watch Page (shared component)
- **[+ Add]** — ручное создание KI через CreateKnowledgeItemModal. `source: 'manual'`

---

## Как LLM создаёт и потребляет KI

### Создание (LLM-as-author)

**Явная команда:** пользователь просит сохранить → AI вызывает `saveKnowledge` с category, title, content, summary, videoId, videoRefs, toolsUsed.

**При Memorize:** кнопка "Memorize" отправляет synthetic conclude turn через `aiChat` (та же модель, тёплый кэш). AI вызывает `saveKnowledge` ×N + `saveMemory` ×1. Tool calls видны в чате как human-friendly badges (expandable для KI — category, summary, ID).

**Conclude context injection:** бэкенд при `isConclude: true` запрашивает существующие KI для этого `conversationId` и добавляет их список в conclude message. AI видит "already saved, do NOT recreate" → создаёт только отсутствующие. Экономия: ~50 tokens input вместо ~6K wasted output per duplicate.

**Custom video resolution:** LLM передаёт YouTube video ID (e.g. `A4SkhlJ2mK8`), но Firestore doc может быть `custom-177...`. `saveKnowledge` handler резолвит через `resolveVideosByIds` (3-step) перед `batch.update()`. Если video не найдено — graceful fallback на channel-level KI.

**Retry:** при rate limit или ошибке, Retry кнопка сохраняет `SendOptions` (`isConclude` + `backendText`) и повторяет conclude turn корректно.

### Discovery (zero cost)

Денормализованные флаги на документах видео/канала (`knowledgeItemCount`, `knowledgeCategories`, `lastAnalyzedAt`). LLM видит их в system prompt и через `getMultipleVideoDetails` tool.

### Retrieval (on-demand)

1. `listKnowledge` — summary + мета (~500 tokens). LLM видит оглавление.
2. `getKnowledge` — полный content (~3-5K tokens per KI). LLM запрашивает только нужные.

---

## Category Registry

Один документ Firestore на канал — map `{[slug]: {label, level, description}}`. Seed categories (5 video + 5 channel) создаются при первом обращении. LLM выбирает из существующих или предлагает новую — auto-добавляется.

Slug validation: `SLUG_PATTERN` (`/^[a-z0-9]+(-[a-z0-9]+)*$/`) — shared между frontend и backend через `shared/knowledge.ts`.

---

## Roadmap

- [x] Phase 1: Data Layer — types, services, hooks, seed categories
- [x] Phase 2: Backend Handlers — `saveKnowledge`, `listKnowledge`, `getKnowledge` + tool definitions
- [x] Phase 3: Conclude Migration — `saveMemory`, `isConclude`, strip content, `CONCLUDE_INSTRUCTION`
- [x] Phase 4: Context Integration — discovery flags, channel metadata, category registry injection
- [x] Phase 5: UI Foundation — RichTextEditor (Tiptap port), RichTextViewer, Zen Mode, KnowledgeCard
- [x] Phase 6: Video UI — Watch Page: tab bar My Notes / AI Research
- [x] Phase 7: Channel UI — Knowledge Page, sidebar, chip-row filters, manual creation
- [x] FINAL — Double review-fix cycle (R1: Architecture, R2: Production Readiness)
- [x] Phase 8: Video Linking + Unified Knowledge Page — edit modal video link/unlink, Knowledge Page shows all scopes, multi-row scope+category filters, discovery flags batch update

← YOU ARE HERE

### Следующие шаги (не начаты)
- [ ] KI recommendations — LLM предлагает обновить устаревшие KI
- [ ] Cross-channel KI — знания, применимые ко всем каналам
- [ ] KI search — полнотекстовый поиск по всем KI канала

---

## Known Issues

- **Custom video: YouTube ID дублируется в `id` и `publishedVideoId`.** При привязке Published URL к кастомному видео YouTube video ID записывается и в `publishedVideoId`, и в поле `id` документа (при этом Firestore doc ID остаётся `custom-*`). Результат: `id = "fu-2rP8VDyI"`, `publishedVideoId = "fu-2rP8VDyI"`. Нужно разобраться: намеренное поведение для какого-то функционала, или баг при обновлении video через Published URL flow.

---

## Related Features

- [Memory System](../chat/context/memory-system.md) — L4 cross-conversation memory; Memorize создаёт KI перед Memory
- [YouTube Research Tools](../chat/tools/README.md) — тулы, генерирующие данные для KI
- [Video View Deltas](../trends/video-view-deltas.md) — delta enrichment, потребитель KI при анализе
- [Competitive Intelligence](../chat/tools/layer-4-competition/competitive-intelligence.md) — competitor analysis, источник channel-level KI

---

## Technical Implementation

### Firestore Collections

| Path | Content |
|------|---------|
| `users/{uid}/channels/{chId}/knowledgeItems/{itemId}` | All KI (flat collection, video + channel via `scope` discriminator) |
| `users/{uid}/channels/{chId}/knowledgeCategories/registry` | Category registry (single doc, map structure) |

Composite indexes deployed: idempotency guard (`conversationId + category + videoId`), list queries (`scope + createdAt`, `videoId + createdAt`, `category + createdAt`, `videoId + category + createdAt`).

### Backend

| File | Role |
|------|------|
| `functions/src/services/tools/handlers/knowledge/saveKnowledge.ts` | Slug validation, idempotency guard (no auto-delete/supersede — each KI is a point-in-time snapshot), **custom video ID resolution** (`resolveVideosByIds` before batch — maps YouTube IDs to `custom-*` docs), atomic batch (KI doc + discovery flags), registry update, **video ref resolution** (regex extract from raw IDs + `vid://` links → `resolveVideosByIds` → `resolvedVideoRefs` snapshot with `hasRealVideoData` guard). Structured logging: `── Validation failed ──`, `── Duplicate ──`, `── Video not found ──`, `── Persisted ──`, `── VideoRefs ──` |
| `functions/src/services/tools/handlers/knowledge/listKnowledge.ts` | Summary + meta (no content), `.limit(50)` |
| `functions/src/services/tools/handlers/knowledge/getKnowledge.ts` | Full content by IDs (`db.getAll`) or filters, `.limit(20)` |
| `functions/src/services/tools/handlers/knowledge/saveMemory.ts` | Conclude-only (`isConclude`), idempotency (60s window), orphan guard, validates `kiRefs` via `db.getAll()` |
| `functions/src/triggers/onKnowledgeItemDeleted.ts` | Firestore trigger: `FieldValue.increment(-1)` + conditional `arrayRemove` for discovery flags |
| `functions/src/services/tools/definitions.ts` | Tool definitions + `CONCLUDE_TOOL_DECLARATIONS` (saveMemory, injected at `isConclude`) |
| `functions/src/chat/aiChat.ts` | `isConclude` → **conclude context injection** (existing KI list appended to avoid duplicates), tool injection, strip `saveKnowledge` content before persist, skip thumbnails/attachments for conclude |

### Frontend

| File | Role |
|------|------|
| `src/core/types/knowledge.ts` | Types: `KnowledgeItem`, `KnowledgeCategoryEntry`, `KnowledgeFlags`, `SEED_CATEGORIES`, `SLUG_PATTERN` re-export |
| `src/core/services/knowledge/knowledgeService.ts` | Firestore CRUD for KI |
| `src/core/services/knowledge/knowledgeCategoryService.ts` | Category registry CRUD + seed creation |
| `src/core/hooks/useKnowledgeItems.ts` | TanStack Query: `useVideoKnowledgeItems`, `useChannelKnowledgeItems`, `useAllKnowledgeItems`, mutations (accept `videoId`/`scope`) |
| `src/core/stores/knowledgeStore.ts` | Zustand: `scopeFilter` (all/channel/video), `selectedCategory`, `sortOrder` (Knowledge Page UI state) |
| `src/features/Knowledge/components/KnowledgeCard.tsx` | Collapsible card: hover-trail, collapsible sections, Badge for source, video ref highlighting via `vid://` links + `linkifyVideoRefs` fallback + `VideoReferenceTooltip` |
| `src/features/Knowledge/components/KnowledgeList.tsx` | Shared list (Watch Page + Knowledge Page), passes `videoMap` |
| `src/features/Knowledge/components/KnowledgeViewer.tsx` | Zen Mode: Portal + AnimatePresence + backdrop blur |
| `src/features/Knowledge/components/VideoLinkField.tsx` | Video link/unlink form field: search dropdown + compact preview, used in Edit modal |
| `src/features/Knowledge/modals/KnowledgeItemModal.tsx` | Edit modal: RichTextEditor, read-only provenance, Badge for source, VideoLinkField for video linking |
| `src/features/Knowledge/modals/CreateKnowledgeItemModal.tsx` | Manual creation: Dropdown molecule for category, RichTextEditor |
| `src/features/Knowledge/utils/linkifyVideoRefs.ts` | (deprecated) Converts raw video IDs → `[title](vid://ID)` links for legacy KI content |
| `src/core/hooks/useVideosCatalog.ts` | Video catalog hook for `@` autocomplete: own + trend channel videos, TanStack Query, staleTime 5min |
| `src/components/ui/organisms/RichTextEditor/extensions/VideoRefMark.ts` | Tiptap Mark for `vid://` links: `addMarkView()` + `ReactMarkViewRenderer`, tooltip via Context |
| `src/components/ui/organisms/RichTextEditor/extensions/VideoMention.ts` | `@` autocomplete extension: `@tiptap/suggestion`, 2+ char threshold, max 10 results |
| `src/components/ui/organisms/RichTextEditor/extensions/VideoRefContext.ts` | React Context for passing video data to MarkView component |
| `src/components/ui/organisms/RichTextEditor/components/VideoRefView.tsx` | React MarkView: highlighted span + `PortalTooltip` + `VideoPreviewTooltip` |
| `src/components/ui/organisms/RichTextEditor/components/VideoSuggestionList.tsx` | Dropdown UI for `@` autocomplete: thumbnail + title + channel + ownership badge |
| `src/features/Knowledge/utils/markdownSections.ts` | `parseMarkdownSections` → hierarchical `HierarchicalSection[]` + preamble |
| `src/features/Knowledge/utils/videoRefMap.ts` | `buildVideoRefMap`: channel videos → `Map<videoId, VideoPreviewData>` (indexed by id + publishedVideoId) |
| `src/features/Watch/components/WatchPageKnowledge.tsx` | Video-level KI: AI Research tab on Watch Page |
| `src/features/Knowledge/utils/knowledgeFilters.ts` | `deriveCategories` + `filterAndSortItems` — pure filter/sort logic extracted for testability |
| `src/pages/Knowledge/KnowledgePage.tsx` | All-scope KI dashboard: multi-row filters (scope + category per scope), sort, manual creation |
| `src/components/ui/organisms/RichTextEditor/` | Tiptap v3 WYSIWYG editor (self-contained organism with extensions inside) |
| `src/core/config/concludePrompt.ts` | `CONCLUDE_INSTRUCTION` — synthetic user message for Memorize |
| `src/core/stores/chat/slices/settingsSlice.ts` | `memorizeConversation()` → `sendMessage()` with `isConclude: true` + `backendText` |
| `src/features/Knowledge/utils/bodyComponents.tsx` | Shared `buildBodyComponents()` — ReactMarkdown component overrides for `vid://` + `mention://` links + `rehype-sanitize`. Used by KnowledgeCard and MemoryCheckpoint |
| `src/core/config/referencePatterns.ts` | `VID_RE` and `MENTION_RE` regex constants for `vid://` / `mention://` URI matching |
| `shared/memory.ts` | `MemoryVideoRef` type (shared), `hasRealVideoData()` guard for fake 1M viewCount on unfetched custom videos |
| `scripts/migrate-ki-video-refs.mjs` | One-time migration: re-resolve `resolvedVideoRefs` for existing KI docs (adds `viewCount`/`publishedAt`) |

### Tests

| File | Coverage |
|------|----------|
| `src/features/Knowledge/utils/__tests__/linkifyVideoRefs.test.ts` | `linkifyVideoRefs` output format (`vid://`), no matches, no double-wrap |
| `src/components/ui/organisms/RichTextEditor/__tests__/vidRoundtrip.test.ts` | `vid://` link markdown roundtrip (turndown/marked) |
| `src/components/ui/organisms/RichTextEditor/__tests__/videoRefMark.test.ts` | `VideoRefMark` parseHTML/renderHTML, `inclusive: false` |
| `src/components/ui/organisms/RichTextEditor/__tests__/videoMentionFilter.test.ts` | `@` autocomplete items filter: threshold, spaces, max results |
| `src/features/Knowledge/utils/__tests__/markdownSections.test.ts` | `parseMarkdownSections`: hierarchy, preamble, nested headings, edge cases |
| `src/features/Knowledge/utils/__tests__/videoRefMap.test.ts` | `buildVideoRefMap`: own videos, publishedVideoId indexing, competitor refs |

### Dependencies (added for KI)

| Package | Purpose |
|---------|---------|
| `@tiptap/react`, `@tiptap/starter-kit`, table/color/text-style extensions | Rich text editor (Tiptap v3) |
| `@tiptap/suggestion` | `@` autocomplete framework for video mentions in editor |
| `turndown` | HTML → Markdown conversion |
| `marked` | Markdown → HTML parsing |
| `remark-gfm` | GFM tables in ReactMarkdown |
| `@tailwindcss/typography` | Prose classes for styled markdown rendering |
| `rehype-sanitize` | XSS protection for markdown rendering in RichTextViewer |

### Architectural Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Flat collection with `scope` discriminator | Better for cross-entity queries vs subcollections |
| 2 | LLM-as-author | Model deep in analysis context knows best what to preserve |
| 3 | Category registry: map, not array | Atomic per-field updates, concurrent-safe |
| 4 | Point-in-time snapshots, no auto-supersede | Each KI is a snapshot — user decides what to keep. Idempotency guard prevents duplicates within same conversation |
| 5 | Conclude = last turn, not separate CF | Warm cache (10x cheaper), same model, one endpoint |
| 6 | Conditional tool availability | `saveKnowledge` always; `saveMemory` only at `isConclude` |
| 7 | Strip KI content at persist | `args.content → [Saved as KI ${id}]`, reduces message bloat |
| 8 | Discovery flags + on-demand retrieval | Flags (zero-cost) → list → get, not all KI in system prompt |
| 9 | `SLUG_PATTERN` via `shared/knowledge.ts` | SSOT for frontend + backend |
| 10 | `onKnowledgeItemDeleted` trigger | Consistent flag decrements regardless of deletion source |
| 11 | Resolve at write, render from snapshot | `saveKnowledge` extracts video IDs from content via regex → resolves via `resolveVideosByIds` (3-step: own/cached/trend) → stores `resolvedVideoRefs: MemoryVideoRef[]` on KI doc. Frontend renders from snapshot — zero Firestore reads. Works for own videos + competitors. Same `MemoryVideoRef` type as Memory system |
| 12 | Video ref highlighting via `vid://` | LLM writes `[title](vid://ID)` links. `bodyComponents.a` renders as `VideoReferenceTooltip`. `linkifyVideoRefs` (deprecated) converts raw IDs → `vid://` for legacy KI. Edit mode: `VideoRefMark` Tiptap Mark with React MarkView + `@` autocomplete via `useVideosCatalog` |
| 13 | Conclude context injection | Backend injects existing KI list into conclude message → AI skips duplicates → ~50 tokens vs ~6K wasted output |
| 14 | Custom video ID resolution | `saveKnowledge` resolves YouTube ID → `custom-*` doc ID via `resolveVideosByIds` before batch. Graceful fallback to channel-level |
| 15 | Knowledge/ as shared feature | Used by Watch Page + Knowledge Page (SRP) |
| 16 | Video linking changes scope | Linking a video sets `scope: 'video'` + `videoId`; unlinking sets `scope: 'channel'` + `deleteField()` on `videoId`. Discovery flags updated atomically in same batch (decrement old entity, increment new). Knowledge Page shows all scopes — KI never "disappears" |
| 17 | Knowledge Page = unified hub | `useAllKnowledgeItems` (no scope filter) + multi-row chip filters (scope row + category rows per scope). Category rows conditionally visible based on scope selection |
