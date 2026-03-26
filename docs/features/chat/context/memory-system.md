# Memory System — Feature Doc

## Текущее состояние

**Реализовано.** 4-слойная система памяти чата. L1 (persistent context) и L2 (per-message labels) обеспечивают awareness — AI знает, какие видео обсуждаются. L3 (summarization) сжимает длинную историю, чтобы не выходить за контекстное окно модели. L4 (cross-conversation memory) сохраняет ключевые инсайты между разговорами по нажатию кнопки "Memorize". Пользователь может также **вручную добавлять memories** из Settings → AI Memory (manual notes без LLM-обработки). L3 summarization всегда выполняется через Gemini Flash (дёшево и быстро), независимо от того, какой провайдер ведёт основной чат. L4 Memorize выполняется **той же моделью**, что ведёт чат (warm cache, provider-agnostic) — как последний turn разговора через `aiChat` endpoint. При Memorize AI сначала создаёт [Knowledge Items](../../knowledge/knowledge-items.md) (структурированные результаты анализа), затем Memory (краткое резюме со ссылками на KI).

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
2. Нажимает кнопку "Memorize" (с опциональной подсказкой — на чём сфокусировать)
3. Отправляется synthetic conclude turn через тот же `aiChat` (та же модель, тёплый кэш)
4. AI вызывает `saveKnowledge` ×N (структурированные результаты анализа) + `saveMemory` ×1 (краткое резюме со ссылками на KI)
5. Conclude turn отображается в чате как обычное сообщение с tool call badges — полная прозрачность
6. Memory появляется как inline checkpoint в таймлайне чата (иконка мозга + название беседы)
7. Checkpoint можно развернуть, отредактировать или удалить
8. Во всех **будущих** разговорах AI видит этот insight в system prompt и ссылается на прошлые решения

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

**Cache-оптимизация: frozen snapshot.** L4 memories инжектируются в system prompt как `memoriesSnapshot` — замороженный snapshot. Это предотвращает каскадную инвалидацию prompt cache: prefix-based cache ломается при любом изменении в system prompt → re-cache всего downstream контента (tools, history). Подробнее: [Prompt Caching](./prompt-caching.md).

**Механизм freeze:**
- `frozenForConversationId` — module-level переменная в `navigationSlice.ts`. Хранит ID разговора, для которого snapshot был заморожен.
- `memoriesSnapshot` — массив `ConversationMemory[]` в store. Используется для `buildSystemPrompt()` вместо live `memories`.
- Snapshot обновляется **только при переключении на другой разговор** (когда `conversationId !== frozenForConversationId`).

**Два пути создания чата и синхронизация `frozenForConversationId`:**

| Путь | Где устанавливается `frozenForConversationId` |
|------|----------------------------------------------|
| `startNewChat()` | → `null`, затем `sendSlice` вызывает `setFrozenConversationId(convId)` при lazy-create conversation |
| `setActiveConversation(id)` | → `id` (если `id !== frozenForConversationId`) |

**Что НЕ сбрасывает snapshot:**
- Навигация в conversation list и возврат в тот же чат (guard: `id === frozenForConversationId`)
- `saveMemory` / `editMemory` mid-chat (пишут в Firestore, live подписка обновляет `memories`, но `memoriesSnapshot` не трогается)
- Редактирование memories в Settings UI
- Закрытие/открытие chat panel

**Что сбрасывает snapshot:**
- Переход в другой разговор (`setActiveConversation` с новым ID)
- Начало нового чата (`startNewChat` → свежий snapshot из текущих `memories`)

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

**Video References:** LLM пишет `[title](vid://ID)` ссылки в memory content (инструкция в `saveMemory` tool description). UI подсвечивает video ID через `linkifyVideoRefs` + `useVideosCatalog` (own + competitor). Старые memories с raw ID тоже подсвечиваются. Legacy `videoRefs[]` поле на memory doc больше не используется в UI.

**KI References (новые memories):** Memories, созданные через новый conclude flow, содержат `kiRefs[]` — ID Knowledge Items, созданных в том же Memorize turn. Memory ссылается на KI, не дублирует их содержание. Подробнее: [Knowledge Items](../../knowledge/knowledge-items.md).

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
| Пользователь нажимает Memorize | — | — | — | Conclude turn: AI создаёт KI + Memory |
| Новый разговор | Свежий контекст | Пустая история | Нет summary | L4 memories snapshot замораживается |

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

## Design Decisions

### Asymmetric permission model (read-many / write-own / patch-any)

LLM **читает все** L4 memories канала (инжектируются в system prompt через `crossConversationLayer`), **создаёт/перезаписывает** memory текущего разговора через `saveMemory` (`docId = conversationId`), и **точечно редактирует любую** memory через `editMemory` (operations-based patching). Каждая memory в system prompt содержит `[mem:id]` — LLM использует этот ID для адресации.

**У LLM нет tool для delete.** Удаление — необратимое действие, остаётся прерогативой пользователя. Protected memories (locked через UI) не редактируются LLM — `editMemory` возвращает ошибку.

| Операция | LLM (tool) | Пользователь (UI) |
|----------|:-:|:-:|
| Создать memory | `saveMemory` (только текущий чат) | Settings → Add Memory |
| Перезаписать memory | Повторный Memorize в том же чате (upsert) | Edit в MemoryCheckpoint / Settings |
| Точечно отредактировать | `editMemory` (любая memory по ID, кроме protected) | Edit в UI |
| Удалить | — | Delete в UI |
| Читать все memories канала | Да (system prompt с `[mem:id]`) | Да (Settings) |

Подробнее: [Edit Memory](./edit-memory.md).

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
- [x] **Video ref highlighting** — `linkifyVideoRefs` + `useVideosCatalog` (own + competitor, staleTime 90min). LLM пишет `[title](vid://ID)`, raw IDs конвертируются at render time. Legacy `videoRefs[]` на memory doc больше не используется в UI.
- [x] **System prompt injection** — `crossConversationLayer` включает видео в формате `[id: videoId]` (совпадает с L1 persistent context).
- [x] **Video highlights** — MemoryCheckpoint и AiAssistantSettings подсвечивают video ID в тексте через `linkifyVideoRefs` + `buildBodyComponents` (shared с KI). `vid://` links с tooltip'ами. Video chips убраны (memory не привязана к видео).
- [x] Тесты: 9 тестов (extractCandidateVideos: appContext, toolCalls, canvas-selection, dedup, edge cases)

Task doc: [memory-video-refs-tasks.md](../../../archive/tasks/chat/context/memory-video-refs-tasks.md)

### Stage 2 — Smart Cross-Conversation Memory (L4) ✅
Улучшение качества генерации L4 memories. L3 summarization работает адекватно — фокус на L4.

Task doc: [cross-chat-memory-stage2-tasks.md](../../../archive/tasks/chat/context/cross-chat-memory-stage2-tasks.md)

- [x] **Consistent memory sections** — обновить `CONCLUDE_SYSTEM_PROMPT` чтобы memory всегда генерировался с фиксированными секциями: `## Decisions`, `## Insights`, `## Channel State`, `## Action Items`, `## Open Questions`. Пустые секции опускаются. Хранение — тот же `content: string` (markdown), `responseSchema` не меняется (`{ content, referencedVideoIds }`). **Влияние на L4:** каждый новый memory — консистентно структурированный текст вместо свободной формы. AI легче находит нужные факты, пользователю легче читать и редактировать. Фундамент для будущей consolidation.
- [x] **Manual memory creation** — кнопка "Add Memory" в Settings → AI Memory. Textarea с опциональным scaffolding (секции из consistent sections). Сохраняется в ту же коллекцию `conversationMemories` с `source: 'manual'` (без `conversationId`, без video refs, без LLM-обработки). **Влияние на L4:** пользователь может добавлять инсайты, полученные вне чата (из YouTube Analytics, конференций, собственных наблюдений) — база знаний AI становится полнее.
- [x] **Custom title for manual memories** — при создании manual memory пользователь может задать заголовок вместо дефолтного "Manual note". Важно для различимости при 5+ manual memories — в system prompt LLM видит `### "заголовок" (дата)`, и одинаковые "Manual note" затрудняют навигацию. Минимальное изменение: текстовое поле title в UI + `conversationTitle` из пользовательского ввода.

#### Когда memory layer станет bottleneck ← YOU ARE HERE

Триггер: `ContextBreakdown.memory` в Token Transparency показывает >30-50% контекстного бюджета. Тогда актуализируются (в порядке приоритета):

- [ ] **Memory consolidation** — user-triggered merge нескольких memories с AI-ассистентом. Protected flag для вечных memories, intention field, before/after preview, atomic replace. Подробнее: [Memory Consolidation](./memory-consolidation.md). **Влияние на L4:** меньше memories в system prompt, нет дублей и конфликтов.
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

- [Knowledge Items](../../knowledge/knowledge-items.md) — структурированные результаты анализа, создаются при Memorize (KI) перед Memory
- [AI Chat README](../README.md) — общая архитектура чата, roadmap всех стадий
- [Context Token Optimization](./token-optimization.md) — compact L1 prompt, влияние на L3 trigger
- [Prompt Caching](./prompt-caching.md) — кэширование system prompt (L1 + L4), interaction с L3
- [Multi-Provider Architecture](../infrastructure/multi-provider.md) — provider router; summarization всегда через Gemini
- [Agentic Architecture](../infrastructure/agentic-architecture.md) — tool calls добавляют контент в историю, ускоряя L3 trigger
- [Chat Resilience](../infrastructure/chat-resilience.md) — retry при ошибке summary generation
- [Memory Consolidation](./memory-consolidation.md) — user-triggered merge memories с AI, protected flag, before/after preview

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
- `MemoryVideoRef` — interface: `{ videoId, title, ownership, thumbnailUrl, viewCount?, publishedAt? }`
- `generateConcludeSummary(apiKey, messages, guidance, model, candidateVideos)` — L4 focused insight extraction; Gemini JSON mode возвращает `{ content, referencedVideoIds }`; fallback на raw text при ошибке парсинга

**Conclude flow:** Memorize = last turn of the chat via `aiChat` endpoint with `isConclude: true`.
- Frontend sends synthetic conclude message through the same streaming pipeline
- `saveMemory` always in `TOOL_DECLARATIONS` (no conditional injection — cache-stable)
- AI calls `saveKnowledge` ×N + `saveMemory` ×1 as tool calls, visible in chat with badges
- `saveMemory` handler (`functions/src/services/tools/handlers/knowledge/saveMemory.ts`): deterministic doc ID (conversationId), upsert (get → exists ? update : set), orphan guard, saves to `conversationMemories` collection
- Uses the same model as the chat (warm cache — 10x cheaper for Anthropic vs cold re-read)
- `generateConcludeSummary` in `memory.ts` remains available for legacy/utility use

**Integration point:** `functions/src/chat/aiChat.ts`
- Calls `buildMemory()` before every provider dispatch
- Passes `memory.history` to provider's `streamChat()`
- Caches `memory.newSummary` + `memory.summarizedUpTo` on conversation doc
- Logs summary token usage separately as "summarize" type

**Model config:** `functions/src/config/models.ts`
- `UTILITY_MODEL_ID = 'gemini-2.5-flash'` — always used for L3 summarization
- L4 Memorize: uses the same model as the chat (provider-agnostic, warm cache)

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
- `src/features/Chat/components/MemoryCheckpoint.tsx` — inline expandable/editable/deletable L4 memory marker в таймлайне чата (video highlights via `linkifyVideoRefs`)

**Conclude prompt:** `src/core/config/concludePrompt.ts`
- `CONCLUDE_INSTRUCTION` — synthetic user message instructing AI to extract KI + Memory

**User-initiated memory CRUD** (frontend-only, no Cloud Functions):
- `src/core/services/ai/chatService.ts` — `ChatService.createMemory()`, `ChatService.updateMemory()`, `ChatService.deleteMemory()` — direct Firestore reads/writes
- `src/core/stores/chat/slices/settingsSlice.ts` — store actions `createMemory()`, `updateMemory()`, `deleteMemory()` delegate to `ChatService`
- Flow: UI (MemoryCheckpoint / AiAssistantSettings) → store action → ChatService → Firestore
- `updateMemory` обновляет `content`, `conversationTitle` (optional), `updatedAt`; сохраняет `createdAt`
- `deleteMemory` — permanent deletion из Firestore (без soft-delete)

**Store integration (Memorize flow):**
- `src/core/stores/chat/slices/sendSlice.ts` — `resumeSendFlow()` reads `memoriesSnapshot` (frozen at conversation start) for system prompt build; passes `isConclude` through to backend; `sendMessage()` supports `SendOptions` with `backendText` (actual prompt) separate from display text
- `src/core/stores/chat/slices/settingsSlice.ts` — `memorizeConversation()` composes display text + `CONCLUDE_INSTRUCTION` and delegates to `sendMessage()`; initializes `memoriesSnapshot` on first subscription load
- `src/core/stores/chat/slices/navigationSlice.ts` — `frozenForConversationId` (module-level) tracks which conversation owns the snapshot; `setActiveConversation()` refreshes snapshot only when entering a *different* conversation; `startNewChat()` resets tracking and freezes fresh snapshot

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
- `videoRefs?: MemoryVideoRef[]` — snapshot видео (legacy memories, created by old CF)
- `kiRefs?: string[]` — IDs of Knowledge Items created during this Memorize (new conclude flow)
- `createdAt: Timestamp`
- `updatedAt: Timestamp`

**MemoryVideoRef** (embedded in memory doc):
- `videoId: string`
- `title: string`
- `ownership: 'own-published' | 'own-draft' | 'competitor'`
- `thumbnailUrl: string`
- `viewCount?: number` — real view count (only when `hasRealVideoData()` returns true)
- `publishedAt?: string` — ISO date string (only when real data available)

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CHARS_PER_TOKEN` | 4 | Rough token estimation ratio |
| `ATTACHMENT_TOKEN_ESTIMATE` | 1,500 | Tokens per attachment in estimate |
| `historyBudgetRatio` | 0.75 (Claude) / 0.85 (Gemini) | Per-model history budget (fallback `HISTORY_BUDGET_RATIO = 0.6`) |
| `MIN_RECENT_MESSAGES` | 10 | Always keep at least 10 recent messages |
| `CONTEXT_LABEL_CHARS_PER_ITEM` | 50 | Estimated chars per appContext label |
| `MAX_MESSAGES` | 2,000 | Legacy — was cap on messages in old `concludeConversation` CF (removed) |
| Recent window budget | 80% of history budget | Sliding window allocation |
| Summary budget | 20% of history budget | Summary text allocation |

### Test Coverage

`functions/src/services/__tests__/memory.test.ts` — ~49 tests across 4 describe blocks:
- `formatContextLabel`: video-card, suggested-traffic, canvas-selection, edge cases
- `buildMemory`: full history, summarization trigger, incremental updates, caching, token estimation
- `extractCandidateVideos`: appContext, canvas-selection nodes, mentionVideo toolCalls, deduplication, defaults, edge cases
- `generateConcludeSummary`: consistent section headers in systemInstruction

`functions/src/services/tools/handlers/knowledge/__tests__/saveMemory.test.ts` — handler tests:
- Create (deterministic ID from conversationId, orphan guard)
- Update / upsert (preserves createdAt, refreshes conversationTitle)
- Error cases (conversation deleted, empty content)

`src/core/services/ai/__tests__/chatService.test.ts` — 4 tests:
- `createMemory`: correct fields & path, empty content validation, whitespace-only validation, markdown special characters pass-through
