# Memory System — Feature Doc

## Текущее состояние

**Реализовано.** 4-слойная система памяти чата. L1 (persistent context) и L2 (per-message labels) обеспечивают awareness — AI знает, какие видео обсуждаются. L3 (summarization) сжимает длинную историю, чтобы не выходить за контекстное окно модели. L4 (cross-conversation memory) сохраняет ключевые инсайты между разговорами по нажатию кнопки "Memorize" — с привязкой конкретных видео (video refs). L4 memories генерируются с **consistent section headers** (`## Decisions`, `## Insights`, `## Channel State`, `## Action Items`, `## Open Questions`). Пользователь может также **вручную добавлять memories** из Settings → AI Memory (manual notes без LLM-обработки). Summarization всегда выполняется через Gemini Flash (дёшево и быстро), независимо от того, какой провайдер ведёт основной чат.

---

## Что это и зачем

Каждая AI модель имеет ограниченное "окно внимания" — количество текста, которое она может "видеть" одновременно. Когда разговор становится длинным, старые сообщения перестают помещаться в это окно.

**Memory System решает две задачи:**

1. **Не потерять контекст в длинном разговоре** — вместо того чтобы просто обрезать старые сообщения (и AI забудет всё, что было раньше), система создаёт сжатое резюме старой части беседы. AI видит: "вот краткое содержание того, что было раньше" + последние сообщения целиком.

2. **Переносить знания между разговорами** — пользователь может "сохранить" ключевые выводы разговора. В следующем разговоре AI уже будет знать эти выводы, не начиная с нуля.

---

## User Flow

### Автоматическое сжатие (L3)

Пользователю не нужно ничего делать — система работает прозрачно:

1. Пользователь ведёт длинный разговор (20+ сообщений с прикреплёнными видео)
2. При каждом сообщении бэкенд оценивает объём истории
3. Когда история приближается к лимиту — автоматически генерируется summary старых сообщений
4. AI видит: `[Conversation Summary]` + последние 10+ сообщений целиком
5. В UI появляется сворачиваемый баннер "Conversation Summary" над списком сообщений
6. При следующих сообщениях summary обновляется инкрементально (допливается, а не пересоздаётся)

**Что пользователь замечает:** ничего, кроме баннера. Качество ответов AI не деградирует — ключевые решения и детали сохраняются в summary.

### Ручное сохранение памяти (L4)

1. Пользователь завершает продуктивный разговор (провёл анализ конкурентов, принял решения по CTR)
2. Нажимает кнопку "Memorize" (с опциональной подсказкой — на чём сфокусировать summary)
3. Система генерирует сфокусированный insight (100-300 слов): ключевые решения, стратегии, числа
4. Memory появляется как inline checkpoint в таймлайне чата (иконка мозга + название беседы)
5. Checkpoint можно развернуть, отредактировать или удалить
6. Во всех **будущих** разговорах AI видит этот insight в system prompt и ссылается на прошлые решения

---

## 4 слоя памяти — как они работают вместе

```
Каждое сообщение к AI:
+----------------------------------------------------------+
|  SYSTEM PROMPT                                            |
|                                                           |
|  [L1] Persistent Context                                  |
|       Все прикреплённые видео: title + metrics             |
|       Обновляется при смене контекста (выбор новых видео)  |
|                                                           |
|  [L4] Cross-Conversation Memory                           |
|       Insights из прошлых разговоров (если сохранены)      |
|       Обновляется при Memorize / Edit / Delete             |
|                                                           |
+----------------------------------------------------------+
|  ИСТОРИЯ СООБЩЕНИЙ                                        |
|                                                           |
|  [L3] Summary (если история не помещается целиком)        |
|       "[Conversation Summary — Earlier Messages]"          |
|       Synthetic model message в начале истории             |
|                                                           |
|  [L2] Per-message labels (на каждом user-сообщении)       |
|       "[📎 Attached: Video "Autumn" (your published)]"     |
|                                                           |
|  ...последние 10+ сообщений целиком...                    |
|  User: "Сравни CTR моих видео"                            |
+----------------------------------------------------------+
```

### L1 — Persistent Context

Компактный список всех видео в контексте (title + views + published + duration + delta views). Формируется из context bridges (Home, Canvas, Trends, Traffic). Подробнее: [Context Token Optimization](./token-optimization.md).

### L2 — Per-Message Labels

К каждому user-сообщению прикрепляется метка `[📎 Attached to this message: ...]`, описывающая что именно было прикреплено. Это позволяет AI (и суммаризатору) понимать хронологию: "в первом сообщении обсуждали Video A, потом переключились на Video B".

Поддерживаемые типы контекста:
- `video-card` — видео с ownership (your draft / your published / competitor)
- `suggested-traffic` — источник трафика + список suggested видео
- `canvas-selection` — ноды с Canvas (видео, traffic sources, sticky notes, images)

### L3 — In-Conversation Summarization

Автоматическое сжатие истории, когда она не помещается в контекстное окно.

**Когда срабатывает:** оценка токенов всех сообщений превышает per-model history budget ratio из `MODEL_HISTORY_RATIOS` (Gemini = 0.85, Claude = 0.75), с fallback на `HISTORY_BUDGET_RATIO` (0.6) для неизвестных моделей.

**Как делит бюджет:**
- 80% бюджета — sliding window (последние сообщения целиком)
- 20% бюджета — summary старых сообщений
- Гарантия: минимум 10 последних сообщений всегда сохраняются verbatim

**Инкрементальная суммаризация:**
- Первый summary: все сообщения до sliding window суммаризируются с нуля
- Последующие: только **новые** сообщения (вышедшие за sliding window) "допливаются" к существующему summary
- Если граница sliding window не сдвинулась — summary не пересчитывается (кэш в Firestore)

**Что сохраняется в summary** (по инструкции суммаризатору):
1. Все решения и выводы с обоснованиями
2. Технические детали: имена, числа, конфигурации, пути
3. Мотивации и контекст каждого решения
4. Нерешённые вопросы и открытые задачи
5. Предпочтения пользователя
6. Хронология: что обсуждалось в каком порядке
7. Какие видео/данные были прикреплены на каждом этапе (из L2 labels)

### L4 — Cross-Conversation Memory

Ручное сохранение инсайтов для использования в будущих разговорах.

**Отличие от L3:** L3 — временное сжатие для управления контекстным окном (живёт в рамках одной беседы). L4 — постоянная "база знаний" пользователя (живёт вечно, видна во всех беседах).

**Что извлекается** (по инструкции):
- Принятые решения и почему
- Выявленные стратегии и паттерны
- Ключевые числа и сравнения
- Нереализованные action items
- Уроки: что работает, а что нет

**Что НЕ попадает в memory:**
- Приветствия и small talk
- Пошаговый ход беседы
- Избыточный контекст (уже в прикреплённых данных)
- Ссылки "Video 3" — только реальные названия

**Video References:** при создании memory код автоматически собирает все видео, обсуждавшиеся в разговоре (из `appContext` и `mentionVideo` tool calls). LLM выбирает, какие из них непосредственно связаны с инсайтом, и возвращает их ID. Эти видео сохраняются как структурированные snapshot-ы (`videoRefs`) вместе с текстом memory — title, ownership, thumbnailUrl на момент создания. В UI они отображаются как chips с обложками, в system prompt будущих чатов — как `[id: videoId]` аннотации (совпадает с форматом L1), позволяя AI узнавать видео, если оно снова появляется в контексте.

**User control:** пользователь может:
- Развернуть и прочитать memory
- Видеть привязанные видео как chips с обложками
- Отредактировать текст (double-click или кнопка Edit)
- Удалить memory
- Добавить guidance при создании ("сфокусируйся на стратегии CTR")

---

## Взаимодействие слоёв

| Событие | L1 | L2 | L3 | L4 |
|---------|----|----|----|----|
| Пользователь прикрепляет видео | Обновляется | — | — | — |
| Пользователь отправляет сообщение | Отправляется в system prompt | Метка добавляется к сообщению | Проверка бюджета → возможно summary | Существующие memories в system prompt |
| История превышает бюджет | — | Labels сохраняются в summary | Summary генерируется/обновляется | — |
| Пользователь нажимает Memorize | — | — | — | Генерация + сохранение |
| Новый разговор | Свежий контекст | Пустая история | Нет summary | Все L4 memories инжектируются |

**Важное взаимодействие L1 ↔ L3:** compact L1 prompt (title + metrics вместо полных description/tags) означает меньший system prompt → больше места для истории → L3 summarization срабатывает позже → больше "свежих" сообщений в контексте.

---

## Known Limitations

### Token estimation — грубая оценка
Используется `CHARS_PER_TOKEN = 4` (4 символа ≈ 1 токен). Для смешанного контента (русский + английский + code + URLs) точность колеблется. Это порог, не биллинг — ошибка в 20-30% допустима. На практике запас большой: при `historyBudgetRatio = 0.85` от 1M (Gemini) остаётся ~150K токенов свободных — промах эвристики на 30% не критичен. Возможен гибридный подход: использовать реальные `inputTokens` из Token Transparency (NormalizedTokenUsage) как базу для предыдущих вызовов, оценивая эвристикой только новые сообщения.

### Нет иерархической суммаризации
При очень длинных разговорах (50+ обменов) summary сам разрастается. Нет механизма "сжать сжатое" — recursive summarization. Summary растёт линейно с длиной разговора.

### Монолитный summary
Summary — один markdown блок. Нет разделения по темам/топикам. При retrieval нельзя подставить только релевантную часть — инжектируется всё или ничего.

### L4 memory — только ручной trigger
Пользователь должен сам нажать "Memorize". Нет автоматического извлечения при завершении или архивации разговора. Легко забыть сохранить ценный разговор.

### Нет memory consolidation
10 L4 memories из 10 разговоров могут содержать повторы или противоречия. Нет автоматического слияния, дедупликации или разрешения конфликтов.

### Summary = synthetic model message
Summary инжектируется как сообщение с `role: "model"` — AI "думает", что это сказал он сам. Не критично для качества, но семантически неточно.

### Нет quality validation
После генерации summary нет проверки, что ключевые факты сохранились. Нет feedback loop: если суммаризатор потерял важную деталь — это навсегда.

---

## Roadmap

### Stage 1 — Basic Memory System ✅
- [x] L1: Persistent Context (video list в system prompt)
- [x] L2: Per-message labels (`[📎 Attached: ...]`)
- [x] L3: Summarization (sliding window + summary + incremental updates)
- [x] L3: Firestore caching (`summary` + `summarizedUpTo` на conversation doc)
- [x] L4: Conclude conversation (Memorize button + guidance)
- [x] L4: Cross-conversation injection в system prompt
- [x] UI: ChatSummaryBanner (сворачиваемый баннер summary)
- [x] UI: MemoryCheckpoint (inline expandable/editable/deletable marker)
- [x] Тесты: ~40 тестов (formatContextLabel, buildMemory, edge cases)

### Stage 1.5 — Video References in Memory ✅
Привязка конкретных видео к L4 memories для сохранения контекста между чатами.

- [x] **Video extraction** — код собирает все видео из `appContext` (video-card + canvas-selection nodes) и `mentionVideo` tool calls (упомянутые AI). Детерминистический сбор, не LLM.
- [x] **LLM selection** — суммаризатор получает список видео-кандидатов и возвращает structured output (JSON): какие из них непосредственно связаны с инсайтом. Structured output через Gemini JSON mode.
- [x] **Snapshot storage** — `videoRefs[]` на memory doc: `{ videoId, title, ownership, thumbnailUrl }` на момент Memorize. Snapshot, не live ссылка. Тип `MemoryVideoRef` в `shared/memory.ts`.
- [x] **System prompt injection** — `crossConversationLayer` включает видео в формате `[id: videoId]` (совпадает с L1 persistent context).
- [x] **UI chips** — MemoryCheckpoint (в чате) и AiAssistantSettings (в настройках) показывают видео как chips с обложками над текстом memory. Shared компонент `MemoryVideoChips`.
- [x] Тесты: 9 тестов (extractCandidateVideos: appContext, toolCalls, canvas-selection, dedup, edge cases)

Task doc: [memory-video-refs-tasks.md](../../../archive/tasks/chat/memory-video-refs-tasks.md)

### Stage 2 — Smart Cross-Conversation Memory (L4) ✅
Улучшение качества генерации L4 memories. L3 summarization работает адекватно — фокус на L4.

Task doc: [cross-chat-memory-stage2-tasks.md](../../../archive/tasks/chat/cross-chat-memory-stage2-tasks.md)

- [x] **Consistent memory sections** — обновить `CONCLUDE_SYSTEM_PROMPT` чтобы memory всегда генерировался с фиксированными секциями: `## Decisions`, `## Insights`, `## Channel State`, `## Action Items`, `## Open Questions`. Пустые секции опускаются. Хранение — тот же `content: string` (markdown), `responseSchema` не меняется (`{ content, referencedVideoIds }`). **Влияние на L4:** каждый новый memory — консистентно структурированный текст вместо свободной формы. AI легче находит нужные факты, пользователю легче читать и редактировать. Фундамент для будущей consolidation.
- [x] **Manual memory creation** — кнопка "Add Memory" в Settings → AI Memory. Textarea с опциональным scaffolding (секции из consistent sections). Сохраняется в ту же коллекцию `conversationMemories` с `source: 'manual'` (без `conversationId`, без video refs, без LLM-обработки). **Влияние на L4:** пользователь может добавлять инсайты, полученные вне чата (из YouTube Analytics, конференций, собственных наблюдений) — база знаний AI становится полнее.
- [x] **Custom title for manual memories** — при создании manual memory пользователь может задать заголовок вместо дефолтного "Manual note". Важно для различимости при 5+ manual memories — в system prompt LLM видит `### "заголовок" (дата)`, и одинаковые "Manual note" затрудняют навигацию. Минимальное изменение: текстовое поле title в UI + `conversationTitle` из пользовательского ввода.

#### Когда memory layer станет bottleneck ← YOU ARE HERE

Триггер: `ContextBreakdown.memory` в Token Transparency показывает >30-50% контекстного бюджета. Тогда актуализируются (в порядке приоритета):

- [ ] **Memory consolidation** — LLM мержит похожие memories. 5 memories про thumbnails из разных разговоров → 1 comprehensive memory. Загрузить все L4 memories канала → сравнить содержимое → слить дубликаты → разрешить противоречия (старое решение отменено новым) → обновить/архивировать устаревшие. **Влияние на L4:** меньше memories в system prompt, нет дублей и конфликтов.
- [ ] **Selective injection** — вместо "все memories в system prompt" → инжектировать только релевантные текущему разговору. Embedding search по содержимому memories (embedding хранится как поле на документе memory, сравнение в коде для десятков memories). **Влияние на L4:** AI получает только нужный контекст, экономия токенов.
- [ ] **AI-driven recall** — `recallMemory(query)` tool: AI сам запрашивает информацию из прошлых разговоров, когда считает нужным. Работает поверх того же embedding search. **Влияние на L4:** AI ищет прошлые инсайты on-demand, даже те, что не были инжектированы в system prompt.

### Stage 3 — Smart Summarization (L3) + Market-Ready Memory
L3 reliability & precision + масштабирование и продвинутые L4 фичи.

#### L3 (In-Conversation Summarization)

- [ ] **Summary quality check** — после генерации L3 summary делать проверочный LLM-вызов: "перечисли 5 ключевых фактов из этого summary" → сравнить с оригинальными сообщениями → если потеряно >30% — регенерировать с повышенным приоритетом сохранения. **Влияние на L3:** страховка от "амнезии" — единственный способ поймать потерю данных до того, как она станет необратимой.
- [ ] **Точная оценка токенов** — заменить `CHARS_PER_TOKEN = 4` на гибридный подход: использовать реальные `inputTokens` из Token Transparency (`NormalizedTokenUsage`) как базу, оценивать эвристикой только новые сообщения. Полная замена на `countTokens()` API — опционально, добавляет +100ms латентности. **Влияние на L3:** точнее определяет момент срабатывания summarization. При текущем запасе (~150K свободных токенов при Gemini 1M) не критично.
- [ ] **Topic segmentation** — вместо одного монолитного summary разбивать на topic chunks (например: `[thumbnails]`, `[titles]`, `[analytics]`). Каждый chunk получает embedding-вектор (через embedding API, provider-agnostic utility operation — аналогично тому, как summarization всегда идёт через Gemini Flash). При формировании контекста: embedding текущего сообщения → cosine similarity с embedding-ами топиков → инжектировать только релевантные chunks, а не весь summary. **Влияние на L3:** AI получает сфокусированный контекст вместо всего монолита → качественнее ответы + экономия ~60% токенов на summary injection. Для 5-10 топиков на разговор — сравнение в коде. Embedding хранится как обычное поле на документе топика.
- [ ] **Hierarchical summarization** — при summary > 3K токенов: recursive pass, сжимающий summary до целевого размера с приоритизацией по importance score. **Влияние на L3:** предотвращает разрастание summary в очень длинных разговорах (50+ обменов) — summary сам не съедает бюджет контекстного окна.
- [ ] **AI-driven recall для L3** — расширение `recallMemory` tool (Stage 2): поиск по topic chunks текущего разговора. AI подгружает забытые topic chunks из ранней части разговора по запросу.

#### L3 + L4

- [ ] **Vector-indexed memory store** — масштабирование embedding search: миграция с in-code cosine similarity на Firestore Vector Search (`findNearest()`, `distanceMeasure: "COSINE"`). Актуально когда L4 memories + L3 topic chunks исчисляются сотнями. Embedding-и уже хранятся как поля документов — нужно только создать vector index. **Влияние на L3:** быстрый поиск по сотням topic chunks. **Влияние на L4:** быстрый поиск по сотням accumulated memories.

#### L4

- [ ] **Auto-conclude stale conversations** — если разговор не активен 7+ дней и содержит 5+ сообщений — предложить Memorize через banner при следующем открытии чата. **Влияние на L4:** больше ценных разговоров превращаются в memories → база знаний полнее.
- [ ] **Memory timeline** — UI для просмотра всех L4 memories хронологически: когда что обсуждалось, как менялись решения со временем. **Влияние на L4:** пользователь видит эволюцию стратегий канала, может чистить устаревшее.
- [ ] **Proactive memory** — AI сам предлагает: "В прошлый раз вы решили X, но с тех пор метрики изменились — хотите пересмотреть?" **Влияние на L4:** memories становятся активным инструментом — AI сам инициирует пересмотр на основе изменений в данных.
- [ ] **Export/import** — экспорт L4 knowledge base канала. При смене инструмента — знания не теряются.
- [ ] **Cost model:** L3 summarization ~$0.001/summary (Flash). L4 conclude ~$0.002/memory (Flash/Pro). Embedding ~$0.0001/query. Consolidation batch ~$0.01/run. Storage: Firestore docs + Vector Index.

---

## Связанные фичи

- [AI Chat README](../README.md) — общая архитектура чата, roadmap всех стадий
- [Context Token Optimization](./token-optimization.md) — compact L1 prompt, влияние на L3 trigger
- [Prompt Caching](./prompt-caching.md) — кэширование system prompt (L1 + L4), interaction с L3
- [Multi-Provider Architecture](../infrastructure/multi-provider.md) — provider router; summarization всегда через Gemini
- [Agentic Architecture](../infrastructure/agentic-architecture.md) — tool calls добавляют контент в историю, ускоряя L3 trigger
- [Chat Resilience](../infrastructure/chat-resilience.md) — retry при ошибке summary generation

---

## Technical Implementation

### Бэкенд

**Core module:** `functions/src/services/memory.ts`
- `SUMMARY_SYSTEM_PROMPT` — base instructions для L3 суммаризатора (что сохранять, формат, приоритеты)
- `CONCLUDE_SYSTEM_PROMPT` — base instructions для L4 conclude (consistent section headers: Decisions / Insights / Channel State / Action Items / Open Questions; extraction rules; target length 100-300 words)
- `estimateTokens(messages)` — heuristic оценка токенов (4 chars/token + attachment overhead)
- `formatContextLabel(appContext)` — L2 labels для summarization context
- `formatMessageForSummary(msg)` — форматирует сообщение для суммаризации (инжектирует L2 labels в user messages)
- `generateSummary(apiKey, messages, existingSummary, model)` — LLM-суммаризация (first-time или incremental)
- `buildMemory(opts)` — orchestrator: budget check → sliding window → summary generation → result
- `extractCandidateVideos(messages)` — детерминистический сбор видео из `appContext` (video-card) + `mentionVideo` tool calls; дедупликация по videoId
- `MemoryVideoRef` — interface: `{ videoId, title, ownership, thumbnailUrl }`
- `generateConcludeSummary(apiKey, messages, guidance, model, candidateVideos)` — L4 focused insight extraction; Gemini JSON mode возвращает `{ content, referencedVideoIds }`; fallback на raw text при ошибке парсинга

**Conclude endpoint:** `functions/src/chat/concludeConversation.ts`
- Cloud Function (onCall), secrets: `GEMINI_API_KEY`
- Reads messages (capped to last `MAX_MESSAGES=2000`) + appContext + toolCalls → extracts candidate videos → generates conclude summary → filters videoRefs by LLM selection → saves to `conversationMemories` collection
- **Idempotency guard:** before write, checks for existing memory with same `conversationId` created in last 60s — returns existing if found (prevents duplicates from double-clicks or retries)
- **Orphan guard:** re-verifies conversation still exists immediately before write (prevents orphaned memory if conversation deleted during Gemini generation)
- Structured logging: `── Data loaded ──`, `── Candidates ──`, `── JSON fallback ──`, `── Duplicate ──`, `── Orphan prevented ──`, `── Persisted ──`, `── Response ──`
- Logs AI usage as "memorize" type

**Integration point:** `functions/src/chat/aiChat.ts`
- Calls `buildMemory()` before every provider dispatch
- Passes `memory.history` to provider's `streamChat()`
- Caches `memory.newSummary` + `memory.summarizedUpTo` on conversation doc
- Logs summary token usage separately as "summarize" type

**Model config:** `functions/src/config/models.ts`
- `UTILITY_MODEL_ID = 'gemini-2.5-flash'` — always used for L3 summarization
- `resolveUtilityModel(userModelId)` — for L4: keeps user's Gemini model, fallbacks to Pro for non-Gemini

### Фронтенд

**Settings Layer (Base Instructions + AI Memory UI):** `src/core/ai/layers/settingsLayer.ts`
- `buildSettingsLayer(aiSettings, projects, activeProjectId)` — собирает system prompt из пользовательских настроек: дата, язык, стиль, **Base Instructions** (`globalSystemPrompt`), project-specific prompt, anti-hallucination rules
- Base Instructions = пользовательский текст из "AI Assistant" tab в глобальных настройках. Отправляется с каждым сообщением как часть system prompt, до L1 и L4

**Settings UI:** `src/features/Settings/components/AiAssistantSettings.tsx`
- "Base Instructions" textarea — редактирование `globalSystemPrompt`
- "AI Memory" section — просмотр, редактирование, удаление и **создание** всех L4 memories (с markdown preview + video chips)
- "Add Memory" button — создание manual memory с placeholder-scaffolding секций

**Cross-conversation layer:** `src/core/ai/layers/crossConversationLayer.ts`
- `buildCrossConversationLayer(memories)` — formats L4 memories into system prompt section
- Включает `**Videos referenced:** "Title" [id: X] (ownership)` для memories с videoRefs

**Chat UI components:**
- `src/features/Chat/components/ChatSummaryBanner.tsx` — collapsible L3 summary banner в чате
- `src/features/Chat/components/MemoryCheckpoint.tsx` — inline expandable/editable/deletable L4 memory marker в таймлайне чата (с video chips)
- `src/features/Chat/components/MemoryVideoChips.tsx` — shared компонент: горизонтальный ряд chips с mini thumbnail + title для videoRefs

**Store integration:** `src/core/stores/chat/slices/sendSlice.ts`
- `resumeSendFlow()` → receives `usedSummary` flag from backend → debug log

### Firestore Schema

**Conversation doc** (`users/{uid}/channels/{chId}/chatConversations/{convId}`):
- `summary: string` — cached L3 summary text
- `summarizedUpTo: string` — message ID of last summarized message

**Memory doc** (`users/{uid}/channels/{chId}/conversationMemories/{memId}`):
- `conversationId?: string` — source conversation (absent for manual memories)
- `conversationTitle: string` — conversation title or "Manual note"
- `content: string` — markdown insight text
- `guidance?: string` — user-provided focus hint
- `source?: 'chat' | 'manual'` — origin type (absent on legacy memories, treated as 'chat')
- `videoRefs: MemoryVideoRef[]` — snapshot видео, о которых инсайт (Stage 1.5)
- `createdAt: Timestamp`
- `updatedAt: Timestamp`

**MemoryVideoRef** (embedded in memory doc):
- `videoId: string`
- `title: string`
- `ownership: 'own-published' | 'own-draft' | 'competitor'`
- `thumbnailUrl: string`

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHARS_PER_TOKEN` | 4 | Rough token estimation ratio |
| `ATTACHMENT_TOKEN_ESTIMATE` | 1,500 | Tokens per attachment in estimate |
| `historyBudgetRatio` | 0.75 (Claude) / 0.85 (Gemini) | Per-model history budget (fallback `HISTORY_BUDGET_RATIO = 0.6`) |
| `MIN_RECENT_MESSAGES` | 10 | Always keep at least 10 recent messages |
| `CONTEXT_LABEL_CHARS_PER_ITEM` | 50 | Estimated chars per appContext label |
| `MAX_MESSAGES` | 2,000 | Cap on messages sent to Gemini for L4 conclude (last N) |
| Recent window budget | 80% of history budget | Sliding window allocation |
| Summary budget | 20% of history budget | Summary text allocation |

### Test Coverage

`functions/src/services/__tests__/memory.test.ts` — ~49 tests across 4 describe blocks:
- `formatContextLabel`: video-card, suggested-traffic, canvas-selection, edge cases
- `buildMemory`: full history, summarization trigger, incremental updates, caching, token estimation
- `extractCandidateVideos`: appContext, canvas-selection nodes, mentionVideo toolCalls, deduplication, defaults, edge cases
- `generateConcludeSummary`: consistent section headers in systemInstruction

`src/core/services/ai/__tests__/chatService.test.ts` — 4 tests:
- `createMemory`: correct fields & path, empty content validation, whitespace-only validation, markdown special characters pass-through
