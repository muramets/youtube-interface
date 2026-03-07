# Memory System — Feature Doc

## Текущее состояние

**Реализовано.** 4-слойная система памяти чата. L1 (persistent context) и L2 (per-message labels) обеспечивают awareness — AI знает, какие видео обсуждаются. L3 (summarization) сжимает длинную историю, чтобы не выходить за контекстное окно модели. L4 (cross-conversation memory) сохраняет ключевые инсайты между разговорами по нажатию кнопки "Memorize". Summarization всегда выполняется через Gemini Flash (дёшево и быстро), независимо от того, какой провайдер ведёт основной чат.

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

Компактный список всех видео в контексте (title + views + published + duration + delta views). Формируется из context bridges (Home, Canvas, Trends, Traffic). Подробнее: [Context Token Optimization](./context-token-optimization.md).

### L2 — Per-Message Labels

К каждому user-сообщению прикрепляется метка `[📎 Attached to this message: ...]`, описывающая что именно было прикреплено. Это позволяет AI (и суммаризатору) понимать хронологию: "в первом сообщении обсуждали Video A, потом переключились на Video B".

Поддерживаемые типы контекста:
- `video-card` — видео с ownership (your draft / your published / competitor)
- `suggested-traffic` — источник трафика + список suggested видео
- `canvas-selection` — ноды с Canvas (видео, traffic sources, sticky notes, images)

### L3 — In-Conversation Summarization

Автоматическое сжатие истории, когда она не помещается в контекстное окно.

**Когда срабатывает:** оценка токенов всех сообщений > 60% контекстного окна модели.

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

**User control:** пользователь может:
- Развернуть и прочитать memory
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
Используется `CHARS_PER_TOKEN = 4` (4 символа ≈ 1 токен). Для смешанного контента (русский + английский + code + URLs) точность колеблется. Это порог, не биллинг — ошибка в 20-30% допустима, но может приводить к преждевременному или запоздалому срабатыванию summary.

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
- [x] Тесты: 17+ тестов (formatContextLabel, buildMemory, edge cases)

### Stage 2 — Reliability & Precision ← YOU ARE HERE
Повысить надёжность оценки токенов и качество summary.

- [ ] **Точная оценка токенов** — заменить `CHARS_PER_TOKEN = 4` на `countTokens()` API Gemini. Один дополнительный API-вызов на сообщение, но точный бюджет вместо heuristic. Кэшировать результат на message doc.
- [ ] **Summary quality check** — после генерации summary делать follow-up вызов: "перечисли 5 ключевых фактов из этого summary" → сравнить с оригиналом → если потеряно >30% — регенерировать с повышенным приоритетом сохранения.
- [ ] **Auto-conclude stale conversations** — если разговор не активен 7+ дней и содержит 5+ сообщений — предложить Memorize через push notification или banner при следующем открытии.
- [ ] **Structured summary output** — вместо free-form markdown генерировать JSON с секциями (`decisions`, `openQuestions`, `keyMetrics`, `actionItems`). Markdown rendering — на клиенте.

### Stage 3 — Smart Memory
Автоматическое управление памятью и topic-aware retrieval.

- [ ] **Hierarchical summarization** — при summary > 3K токенов: recursive pass, сжимающий summary до целевого размера с приоритизацией по importance score.
- [ ] **Topic segmentation** — разбивать summary на topic chunks с embeddings. При формировании контекста — retrieval только релевантных chunks (а не всего summary).
- [ ] **Memory consolidation** — периодический batch job: анализ всех L4 memories канала → слияние дубликатов → разрешение противоречий → обновление/архивация устаревших.
- [ ] **AI-driven recall** — `recallMemory(query)` tool: AI сам решает, когда ему нужна информация из прошлых разговоров, и запрашивает конкретный topic.

### Stage 4 — Market-Ready Memory
Полноценная персистентная память ассистента. Пользователь ведёт разговоры месяцами, ассистент накапливает экспертизу о канале.

- [ ] **Vector-indexed memory store** — все L4 memories + conversation summaries индексируются через embeddings. Semantic search по всей истории взаимодействий.
- [ ] **Memory timeline** — UI для просмотра всех memories хронологически: когда что обсуждалось, как менялись решения со временем.
- [ ] **Proactive memory** — AI сам предлагает: "В прошлый раз вы решили X, но с тех пор метрики изменились — хотите пересмотреть?"
- [ ] **Export/import** — экспорт knowledge base канала. При смене инструмента — знания не теряются.
- [ ] **Cost model:** L3 summarization ~$0.001/summary (Flash). L4 conclude ~$0.002/memory (Flash/Pro). Memory retrieval ~$0.0005/query. Consolidation batch ~$0.01/run. Storage: Firestore + Vector Index.

---

## Связанные фичи

- [AI Chat README](./README.md) — общая архитектура чата, roadmap всех стадий
- [Context Token Optimization](./context-token-optimization.md) — compact L1 prompt, влияние на L3 trigger
- [Prompt Caching](./prompt-caching.md) — кэширование system prompt (L1 + L4), interaction с L3
- [Multi-Provider Architecture](./multi-provider.md) — provider router; summarization всегда через Gemini
- [Agentic Architecture](./agentic-architecture.md) — tool calls добавляют контент в историю, ускоряя L3 trigger
- [Chat Resilience](./chat-resilience.md) — retry при ошибке summary generation

---

## Technical Implementation

### Бэкенд

**Core module:** `functions/src/services/memory.ts`
- `SUMMARY_SYSTEM_PROMPT` — base instructions для L3 суммаризатора (что сохранять, формат, приоритеты)
- `CONCLUDE_SYSTEM_PROMPT` — base instructions для L4 conclude (extraction rules, что включать/исключать, target length)
- `estimateTokens(messages)` — heuristic оценка токенов (4 chars/token + attachment overhead)
- `formatContextLabel(appContext)` — L2 labels для summarization context
- `formatMessageForSummary(msg)` — форматирует сообщение для суммаризации (инжектирует L2 labels в user messages)
- `generateSummary(apiKey, messages, existingSummary, model)` — LLM-суммаризация (first-time или incremental)
- `buildMemory(opts)` — orchestrator: budget check → sliding window → summary generation → result
- `generateConcludeSummary(apiKey, messages, guidance, model)` — L4 focused insight extraction

**Conclude endpoint:** `functions/src/chat/concludeConversation.ts`
- Cloud Function (onCall), secrets: `GEMINI_API_KEY`
- Reads all messages + appContext → generates conclude summary → saves to `conversationMemories` collection
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

**Settings UI:** `src/features/Settings/AiAssistantSettings.tsx`
- "Base Instructions" textarea — редактирование `globalSystemPrompt`
- "AI Memory" section — просмотр, редактирование и удаление всех L4 memories (с markdown preview)

**Cross-conversation layer:** `src/core/ai/layers/crossConversationLayer.ts`
- `buildCrossConversationLayer(memories)` — formats L4 memories into system prompt section

**Chat UI components:**
- `src/features/Chat/components/ChatSummaryBanner.tsx` — collapsible L3 summary banner в чате
- `src/features/Chat/components/MemoryCheckpoint.tsx` — inline expandable/editable/deletable L4 memory marker в таймлайне чата

**Store integration:** `src/core/stores/chat/slices/sendSlice.ts`
- `resumeSendFlow()` → receives `usedSummary` flag from backend → debug log

### Firestore Schema

**Conversation doc** (`users/{uid}/channels/{chId}/chatConversations/{convId}`):
- `summary: string` — cached L3 summary text
- `summarizedUpTo: string` — message ID of last summarized message

**Memory doc** (`users/{uid}/channels/{chId}/conversationMemories/{memId}`):
- `conversationId: string` — source conversation
- `conversationTitle: string`
- `content: string` — markdown insight text
- `guidance?: string` — user-provided focus hint
- `createdAt: Timestamp`
- `updatedAt: Timestamp`

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHARS_PER_TOKEN` | 4 | Rough token estimation ratio |
| `ATTACHMENT_TOKEN_ESTIMATE` | 1,500 | Tokens per attachment in estimate |
| `historyBudgetRatio` | 0.75 (Claude) / 0.85 (Gemini) | Per-model history budget (fallback `HISTORY_BUDGET_RATIO = 0.6`) |
| `MIN_RECENT_MESSAGES` | 10 | Always keep at least 10 recent messages |
| `CONTEXT_LABEL_CHARS_PER_ITEM` | 50 | Estimated chars per appContext label |
| Recent window budget | 80% of history budget | Sliding window allocation |
| Summary budget | 20% of history budget | Summary text allocation |

### Test Coverage

`functions/src/services/__tests__/memory.test.ts` — 17 tests:
- `formatContextLabel`: 16 tests covering video-card, suggested-traffic, canvas-selection, edge cases
- `buildMemory`: 12 tests covering full history, summarization trigger, incremental updates, caching, token estimation
