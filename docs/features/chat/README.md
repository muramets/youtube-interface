# 💬 AI Chat — Feature Doc

## Текущее состояние

AI ассистент в правой панели приложения. Поддерживает мультичат (несколько бесед), стриминг ответов, прикрепление изображений и видео через мосты контекста.

**Контекст:** 4 моста передают выбранные видео в чат через 4 слота в `appContextStore`:
- `playlist` — выбранные видео с Home, Playlists, PlaylistDetail (общий hook `useSelectionContextBridge`)
- `traffic` — выбранные source videos из Suggested Traffic таблицы (напрямую через `setSlot`)
- `canvas` — выбранные ноды на Canvas (video, traffic-source, sticky-note, image, frame)
- `trends` — выбранные competitor videos из Trends

Видео передаются **компактно** (title + metrics) → system prompt ~10K токенов на 150 видео. Description и tags доступны Gemini через `getMultipleVideoDetails` tool on-demand.

**Память:** 4 слоя — L1 persistent context, L2 per-message labels, L3 сжатие истории, L4 cross-conversation memory.

**Упоминания:** Gemini вызывает `mentionVideo(videoId)` tool → ссылается в тексте как `[Title](mention://videoId)` → интерактивный badge с tooltip. Data loop замкнут: `videoMap` строится из persistedContext + resolved mentionVideo tool call результатов (динамически обнаруженные видео тоже получают badges).

**Memory Bar:** Read-only audit trail — показывает прикреплённый контекст беседы без возможности удаления (удаление ломает mention badges в предыдущих сообщениях).

**Модели:** Gemini 3 Pro (default), 3 Flash, 2.5 Pro, 2.5 Flash — переключаемые в UI. Thinking level per-model.

---

## Roadmap

### Стадия 1 — MVP ✅
Базовый чат, стриминг, история сообщений, выбор модели.
- [x] ChatPanel с SSE стримингом
- [x] Мультичат (создание, переключение, удаление бесед)
- [x] Выбор модели Gemini в UI
- [x] Прикрепление изображений
- [x] Отправка system prompt с контекстом

### Стадия 2 — Context Bridges ✅
Мосты связывают страницы приложения с чатом. Выбрал видео → оно появляется в чате.
- [x] Selection Bridge (Home, Playlists — общий hook)
- [x] Canvas Bridge (Canvas selection → чат)
- [x] Trends Bridge (Competitor videos → чат)
- [x] Suggested Traffic Bridge (Traffic sources → чат)
- [x] Sticky behavior (снятие выделения не убирает контекст)
- [x] Pause/resume bridges

### Стадия 3 — Memory System ✅
Чат помнит контекст в рамках беседы и между беседами.
- [x] L1: Persistent Context (все прикреплённые видео в system prompt)
- [x] L2: Per-message labels (`[📎 Attached: Video "Autumn"]`)
- [x] L3: Summarization (сжатие истории при переполнении)
- [x] L4: Conclude (кросс-чат память — инсайты между беседами)

### Стадия 4 — Video Mentions ✅
Gemini ссылается на конкретные видео, пользователь видит кликабельные badges.
- [x] Regex парсинг "Video #N" (legacy, удалён в Stage 5)
- [x] Tooltip с обложкой и метриками
- [x] Contextual Fallback Resolution (legacy, удалён в Stage 5)
- [x] Поддержка кириллицы и Unicode

### Стадия 5 — Agentic Mode (Function Calling) ✅
**Архитектурный переход:** Gemini стал **агентом** — вызывает tools, получает результаты, продолжает рассуждение.

- [x] Tool Definitions Registry (`mentionVideo`, `getVideoDetails`)
- [x] Tool Executor — диспетчер function calls на бэкенде
- [x] Agentic Loop в `streamChat()` (до 10 итераций)
- [x] SSE Event Types (`toolCall`, `toolResult`, `thought`, `done`, `error`)
- [x] System Prompt Migration — `[id: videoId]` аннотации вместо порядковых номеров
- [x] Thinking Level per-model (backend + UI toggle)
- [x] ToolCallBadge — inline pills (pending/resolved/error)
- [x] ThinkingBubble — collapsible thinking chain display
- [x] Structured Mentions — `mention://videoId` вместо regex
- [x] Regex Cleanup — удалён `injectVideoReferenceLinks` и regex fallback (~200 строк)
- [x] **Mention Data Loop** — `referenceVideoMap` дополняется из resolved `mentionVideo` tool calls (динамически обнаруженные видео → badges)
- [x] **Prompt Consolidation** — единый source of truth для mentionVideo инструкции в `ANTI_HALLUCINATION_RULES` правило 6 (дубли из `VIDEO_CONTEXT_PREAMBLE` и `TRAFFIC_SUGGESTED_HEADER` удалены)
- [x] **Proactive viewThumbnails** — правило 9 + tool descriptions заставляют Gemini самостоятельно анализировать обложки при CTR-рекомендациях
- [x] **Read-only Memory Bar** — `PersistedContextBar` больше не позволяет удалять контекст mid-conversation (предотвращает поломку mentions)
- [x] **Token Optimization** — compact L1 prompt (description+tags убраны, ~75% экономии)
- [x] Batch tool `getMultipleVideoDetails(videoIds[])` — on-demand fetch из двух коллекций (`videos/` + `cached_suggested_traffic_videos/`)
- [x] Consolidated ToolCallSummary — группировка pills по типу + expandable video preview

### Стадия 6 — RAG + Visual Context ← YOU ARE HERE
**Архитектурный переход:** compact prompt UЖЕ сделан. Осталось: visual context (обложки) + vector search.

**Что уже сделано (в рамках Stage 5-6):**
- ✅ Compact L1: system prompt содержит только title + key metrics (views, published, duration)
- ✅ On-demand details: `getMultipleVideoDetails` возвращает description, tags и пр. по запросу
- ✅ Dual-collection lookup: поиск в `videos/` и `cached_suggested_traffic_videos/`
- ✅ **Delta Enrichment Middleware**: `enrichContextWithDeltas()` автоматически дополняет видео данными о росте просмотров (24h/7d/30d) из trend snapshots перед отправкой в Gemini. Gemini видит формат `Views: 111K | 24h: +1.2K / 7d: +5.3K / 30d: +12K`
- ✅ **Traffic Sources Enrichment**: per-video toggle 📊 на VideoCardChip → `enrichContextWithTrafficSources()` загружает CSV snapshots из Cloud Storage, формирует baseline + deltas текст. Gemini видит историю по каждому traffic source (Suggested, Browse, Search).

**Что осталось:**

**Visual Context (обложки):**
- [ ] Vision API: batch-описание обложек → `thumbnailDescription` в Firestore
- [ ] Автоматическое описание при добавлении нового видео
- [ ] `getMultipleVideoDetails` возвращает thumbnail URL → Gemini видит обложку

**Vector Search:**
- [ ] Embedding API: vector embedding для каждого видео
- [ ] Firestore Vector Index
- [ ] `searchDatabase(query, filters)` — семантический поиск по всей базе

### Стадия 7 — YouTube Research Agent
Ассистент выходит за пределы базы и исследует YouTube по запросу.
- [ ] `searchYouTube(query)` — поиск видео на YouTube
- [ ] `analyzeChannel(channelId)` — последние N видео канала + обложки
- [ ] Предупреждение о квоте: *"Это займёт 200 units из 8,400 доступных. Продолжить?"*
- [ ] Подтягивание subscriberCount канала
- [ ] Vision анализ обложек конкурентов в реальном времени

### 🚀 Стадия 8 — Production (финальный продукт)
**User flow:** Пользователь открывает чат → ассистент знает ВСЁ о его видео, трендах, конкурентах. Контекст передаётся легковесно — только ID, Gemini сама находит данные в базе. Можно прикрепить 500 видео из Suggested Traffic и не платить за 500 описаний — Gemini загрузит нужные по мере обсуждения.

- [ ] Полноценный агент с thinking, Tools, Vector Search
- [ ] Контекст = вся Firestore база, мосты передают только ID
- [ ] Gemini всегда видит обложку обсуждаемого видео
- [ ] YouTube Research с контролем квоты
- [ ] **Gemini Context Caching** — при стабильном system prompt 32K+ tokens (вся база видео) кэшировать на стороне Google → ~75% экономии на input tokens
- [ ] **Стоимость:** ~$0.02/запрос (RAG) вместо $0.49 (full context)

---

## Связанные фичи
- [Canvas](../canvas.md) — Canvas Bridge передаёт selected nodes в чат
- [Trends](../trends.md) — Trends Bridge передаёт competitor videos в чат
- [Video](../video.md) — Selection Bridge передаёт selected videos в чат

## Техническая заметка (для агента)
**Компоненты:** `ChatPanel.tsx`, `ChatInput.tsx`, `ChatMessageList.tsx`, `ChatBubble.tsx`
**Chips:** `VideoCardChip.tsx`, `SuggestedTrafficChip.tsx`, `CanvasSelectionChip.tsx`
**Hooks:** `features/Chat/hooks/` (5 hooks)
**Utils:** `videoReferenceUtils.ts` (legacy utils, большая часть удалена)
**Stores:** `appContextStore.ts` (4 слота: playlist, traffic, canvas, trends)
**Backend:** `functions/src/services/gemini.ts` (agentic loop), `tools/` (definitions, executor, handlers), `memory.ts` (4 layers)
**Types:** `appContext.ts` (VideoCardContext, SuggestedTrafficContext, CanvasSelectionContext)
**Bridges:** useSelectionContextBridge (Home+Playlists), TrafficTab (traffic), useCanvasContextBridge, useTrendsContextBridge
**Enrichment:** `enrichContextWithDeltas.ts` (delta views middleware), `enrichContextWithTrafficSources.ts` (traffic sources middleware), `core/ai/utils/formatTrafficSources.ts` (pure formatter)
**Shared Utils:** `core/utils/trafficSource/` (delta.ts, parser.ts, snapshotLoader.ts) — shared between UI table и AI enrichment
