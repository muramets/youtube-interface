# 💬 AI Chat — Feature Doc

## Текущее состояние

AI ассистент в правой панели приложения. Поддерживает мультичат (несколько бесед), стриминг ответов, прикрепление изображений и видео через мосты контекста.

**Контекст:** 4 моста передают выбранные видео в чат через 4 слота:
- `playlist` — выбранные видео с Home, Playlists, PlaylistDetail
- `traffic` — выбранные source videos из Suggested Traffic таблицы
- `canvas` — выбранные ноды на Canvas (video, traffic-source, sticky-note, image, frame)
- `trends` — выбранные competitor videos из Trends

Видео передаются **компактно** (title + metrics) → system prompt ~10K токенов на 150 видео. Description и tags доступны Gemini через `getMultipleVideoDetails` tool on-demand.

**Память:** 4 слоя — L1 persistent context, L2 per-message labels, L3 сжатие истории, L4 cross-conversation memory.

**Упоминания:** AI вызывает `mentionVideo` tool → ссылается в тексте как `[Title](mention://videoId)` → интерактивный badge с tooltip. Динамически обнаруженные видео (не из контекста) тоже получают badges.

**Memory Bar:** Read-only audit trail — показывает прикреплённый контекст беседы без возможности удаления (удаление ломает mention badges в предыдущих сообщениях).

**Модели:** 7 моделей от 2 провайдеров — Gemini (3.1 Pro, 3 Flash, 2.5 Pro, 2.5 Flash) + Claude (Opus 4.6, Sonnet 4.6, Haiku 4.5). Dropdown группирует по провайдеру. Thinking level per-model. File attachments per-model (Gemini: all types; Claude: image + PDF). Подробнее: [Multi-Provider Architecture](./infrastructure/multi-provider.md).

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

- [x] Tool Definitions Registry (`mentionVideo`, `getMultipleVideoDetails`)
- [x] Tool Executor — диспетчер function calls на бэкенде
- [x] Agentic Loop в `streamChat()` (до 10 итераций)
- [x] SSE Event Types (`chunk`, `toolCall`, `toolResult`, `toolProgress`, `thought`, `done`, `error`, `confirmLargePayload`, `retry`)
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
- [x] Batch tool `getMultipleVideoDetails(videoIds[])` — on-demand fetch из двух коллекций (`videos/` + `cached_external_videos/`) + YouTube API fallback
- [x] Consolidated ToolCallSummary — группировка pills по типу + expandable video preview
- [x] `analyzeTrafficSources` — анализ источников трафика видео on-demand
- [x] `analyzeSuggestedTraffic` — анализ suggested traffic с визуальным UI

### Стадия 6 — RAG + Visual Context ✅
**Архитектурный переход:** compact prompt + visual context + vector search + competitive intelligence. Embedding infrastructure, semantic search, visual search и free-text search — всё реализовано.

**Что уже сделано (в рамках Stage 5-6):**
- ✅ Compact L1: system prompt содержит только title + key metrics (views, published, duration)
- ✅ On-demand details: `getMultipleVideoDetails` возвращает description, tags и пр. по запросу
- ✅ Unified cache lookup: поиск в `videos/` и `cached_external_videos/` (после консолидации кэшей)
- ✅ **Delta Enrichment Middleware**: `enrichContextWithDeltas()` автоматически дополняет видео данными о росте просмотров (24h/7d/30d) из trend snapshots перед отправкой в AI. Формат `Views: 111K | 24h: +1.2K / 7d: +5.3K / 30d: +12K`
- ✅ **Traffic Sources**: 📊 иконка на VideoCardChip → read-only indicator (traffic data exists). Анализ трафика — on-demand через tool `analyzeTrafficSources` / `analyzeSuggestedTraffic`.
- ✅ **viewThumbnails tool**: AI видит обложки видео как изображения. Gemini: Files API upload + 47h cache + approval gate (≥15 обложек). Claude: inline URL image blocks без gate. Подробнее: [viewThumbnails](./tools/layer-2-detail/2-view-thumbnails-tool.md).
- ✅ **Markdown Normalizer**: `normalizeMarkdown()` — нормализационный слой между LLM-выводом и `ReactMarkdown`. Исправляет структурные ошибки (таблица, склеенная с текстом). Code fence-aware — не трогает содержимое code blocks.
- ✅ **Competitive Intelligence Этапы 1–3**: Layer 4 (Competition) — 4 инструмента (`listTrendChannels`, `browseTrendVideos`, `getNicheSnapshot`, `findSimilarVideos`) дают AI полный доступ к данным конкурентов: browsing, niche analytics, semantic search по теме (text embeddings) и визуальному сходству обложек (Vertex AI). Подробнее: [Competitive Intelligence](./tools/layer-4-competition/competitive-intelligence.md).
- ✅ **Visual Context**: `thumbnailDescription` генерируется автоматически для всех видео конкурентов через Gemini Flash Vision. `scheduledEmbeddingSync` (daily 00:30 UTC) подхватывает новые видео.
- ✅ **Vector Search Infrastructure**: packaging embeddings (768d, gemini-embedding-001) + visual embeddings (1408d, Vertex AI multimodalembedding@001). Два Firestore vector index. `findSimilarVideos` — search по сходству (3 modes: packaging, visual, both с RRF merge).
- ✅ **searchDatabase** — free-text семантический поиск по всей базе конкурентов. `generateQueryEmbedding` с `taskType: RETRIEVAL_QUERY` → cosine vector search → enrichment (deltas, tiers, coverage). Подробнее: [searchDatabase](./tools/layer-4-competition/5-search-database-tool.md).

### Стадия 7 — YouTube Research Agent (частично ✅) ← YOU ARE HERE
Ассистент выходит за пределы базы и исследует YouTube по запросу. Telescope pattern: обзор канала → список видео → детали → анализ трафика.

**Реализовано (P0–P3):**
- [x] `getChannelOverview(channelId)` — статистика канала, последние видео, subscriber count
- [x] `browseChannelVideos(channelId)` — пагинированный список видео канала с метриками
- [x] Кеширование внешних видео в `cached_external_videos/` для повторного использования
- [x] Подробнее: [AI Chat Tools](./tools/README.md)

**Что осталось:**
- [ ] `searchYouTube(query)` — поиск видео на YouTube
- [ ] Предупреждение о квоте: *"Это займёт 200 units из 8,400 доступных. Продолжить?"*
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

## Ghost Message (Stop Generation)

Когда пользователь нажимает **Stop** во время стриминга ответа модели, частичный ответ и thinking chain сохраняются как **ghost message** — "призрачное" сообщение, видимое пользователю, но невидимое для AI.

**Поведение:**
- Сохраняются: частичный текст + thinking chain + tool calls → `stoppedResponse` (Zustand, session-only)
- **Не** пишется в Firestore → **не** попадает в контекст API → модель не наследует оборванную мысль
- Отображается полупрозрачным bubble с пометкой "Generation stopped" (thinking → tool call pills → текст)
- Автоматически очищается при: отправке нового сообщения, редактировании предыдущего, переключении диалога, начале нового чата
- Не переживает перезагрузку страницы (session-only by design)

**Зачем:** пользователь видит, как модель рассуждала и что успела написать → может скорректировать свой промпт → при повторной отправке модель начинает "с чистого листа".

---

## Known Issues

### Streaming dots пропадают при навигации назад-вперёд

`setActiveConversation` сбрасывает `isStreaming` + `streamingNonce` при **любом** переключении — даже при возврате в тот же чат. Stream продолжает бежать на сервере, ответ появится через Firestore subscription, но streaming dots пропадают.

**Задача:** не сбрасывать streaming state при возврате в тот же conversation. Отвязать `streamingNonce` от navigation — nonce должен инвалидироваться только при переключении на **другой** conversation или при явном `stopGeneration`.

**Затронутые файлы:** `navigationSlice.ts` — `setActiveConversation`, `startNewChat`

---

## Связанные фичи
- [Context Bridges](./context/bridges/README.md) — 4 моста: автосинхронизация выделения со страниц в Chat (architecture, bridges, enrichment pipeline)
- [Multi-Provider Architecture](./infrastructure/multi-provider.md) — Gemini + Claude, provider router, abstraction layer
- [Memory System](./context/memory-system.md) — 4-слойная память: L1-L4, summarization, cross-conversation memory
- [AI Chat Tools](./tools/README.md) — Telescope pattern: getChannelOverview → browseChannelVideos
- [viewThumbnails](./tools/layer-2-detail/2-view-thumbnails-tool.md) — AI визуально анализирует обложки видео
- [analyzeSuggestedTraffic](./tools/layer-3-analysis/2-analyze-suggested-traffic-tool.md) — анализ suggested traffic с визуальным UI
- [Competitive Intelligence](./tools/layer-4-competition/competitive-intelligence.md) — 4 инструмента для анализа конкурентов: browsing, niche analytics, semantic + visual search
- [Prompt Caching](./context/prompt-caching.md) — кэширование system prompt, tools и истории для экономии ~80% на input tokens
- [Thinking Persistence](./context/thinking-persistence.md) — сохранение thinking bubbles в Firestore между сессиями

---

## Technical Implementation (для агента)

**Компоненты:** `ChatPanel.tsx`, `ChatInput.tsx`, `ChatMessageList.tsx`, `ChatBubble.tsx`
**Chips:** `VideoCardChip.tsx`, `SuggestedTrafficChip.tsx`, `CanvasSelectionChip.tsx`
**Hooks:** `features/Chat/hooks/` (7 hooks: useChatDerivedState, useChatDragDrop, useChatNavigation, useChatScroll, useCostAlerts, useFileAttachments, usePanelGeometry)
**Utils:** `videoReferenceUtils.ts` (legacy utils), `toolCallGrouping.ts` (группировка tool calls по типу для ToolCallSummary), `normalizeMarkdown.ts` (нормализация LLM markdown — fix glued tables, code fence awareness), `buildToolVideoMap.ts` (video lookup из всех tool results — merge данных из browse/details/mention)
**Stores:** `appContextStore.ts` (4 слота: playlist, traffic, canvas, trends), `chatStore` → `stoppedResponse` (ghost message, session-only)
**Backend:** `functions/src/services/ai/` (provider router, retry, tool execution), `gemini/` (Gemini provider), `claude/` (Claude provider), `tools/` (definitions, executor, handlers), `memory.ts` (4 layers). Подробнее: [Multi-Provider Architecture](./infrastructure/multi-provider.md).
**Types:** `appContext.ts` (VideoCardContext, SuggestedTrafficContext, CanvasSelectionContext)
**Bridges:** useSelectionContextBridge (Home+Playlists), TrafficTab (traffic), useCanvasContextBridge, useTrendsContextBridge
**Enrichment:** `core/ai/pipeline/enrichContextWithDeltas.ts` (delta views middleware), `core/ai/utils/formatTrafficSources.ts` (pure formatter)
**Shared Utils:** `core/utils/trafficSource/` (delta.ts, parser.ts, snapshotLoader.ts) — shared between UI table и AI enrichment
