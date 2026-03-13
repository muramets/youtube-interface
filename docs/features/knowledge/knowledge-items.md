# Knowledge Items

> Система долговременного хранения результатов AI-анализа видео и канала, доступная LLM в будущих чатах без повторного исследования.

## Что это такое

**Аналогия:** Представь, что врач после каждого визита пациента записывает подробные результаты обследования в медицинскую карту. Когда пациент приходит к другому врачу — тот открывает карту, видит все прошлые анализы, диагнозы и наблюдения, и продолжает с того места, где остановился предыдущий. Не нужно заново сдавать анализы и рассказывать историю болезни.

Knowledge Items (KI) — это "медицинская карта" для видео и канала. Когда LLM глубоко анализирует видео в чате (трафик, suggested pool, упаковку) — результаты этого анализа сохраняются как структурированные документы. Следующая LLM в новом чате видит: "у этого видео есть 3 Knowledge Items" — и может запросить их вместо повторного исследования.

**Зачем:**
- Тулы анализа (analyzeSuggestedTraffic, analyzeTrafficSources) возвращают 10-40K токенов результатов. Эти данные одноразовые — при закрытии чата они теряются.
- Memory System (L4) сохраняет краткое содержание разговора (~200-500 слов), а не детальные результаты исследования.
- Без KI каждый новый чат начинается с нуля: те же тулы, те же API-запросы, те же токены — чтобы узнать то, что уже было выяснено.
- KI превращает каждый чат из "одноразовой лаборатории" в "накапливающуюся базу знаний".

**Два уровня:**
- **Video KI** — результаты анализа конкретного видео (трафик, suggested pool, упаковка, позиционирование)
- **Channel KI** — стратегические выводы об эволюции канала (journey, стратегии, рост, гипотезы об алгоритме)

## Текущее состояние

← YOU ARE HERE (проектирование завершено, реализация не начата)

- [ ] **Этап 1: Data Layer** — типы, Firestore schema, CRUD сервисы, category registry
- [ ] **Этап 2: Chat Tools** — `saveKnowledge`, `listKnowledge`, `getKnowledge` handlers + tool definitions
- [ ] **Этап 3: Conclude Integration** — расширение concludeConversation: KI extraction → save → Memory with KI refs
- [ ] **Этап 4: Context Integration** — флаги на документах видео/канала, инъекция в system prompt
- [ ] **Этап 5: Video UI** — Watch Page: табы My Notes / AI Research, карточки, inline expand
- [ ] **Этап 6: Channel UI (Lab Page)** — sidebar route, фильтры (паттерн Music Page), список KI
- [ ] **Этап 7: View & Edit** — Zen Mode (fullscreen read-only), Edit Modal с RichTextEditor (порт из MonkeyLearn)
- [ ] **Этап 8: Production Hardening** — тесты, review gates, edge cases

## Отличие от Memory System

| | Memory (L4) | Knowledge Items |
|---|-------------|-----------------|
| **Цель** | "Что помнить из разговора" | "Что известно об объекте" |
| **Привязка** | К разговору (conversationId) | К видео или каналу |
| **Размер** | ~200-500 слов, сжатое | ~1000-5000 слов, структурированное |
| **Категоризация** | Один блоб markdown | Типизированный документ с category |
| **Инъекция в чат** | Всегда в system prompt (все memories) | По запросу через тул (только нужные) |
| **Старение** | Быстро теряет актуальность | Исторический срез, валиден как факт на момент анализа |
| **Создание** | При Conclude (после KI) | Явная команда в чате + при Conclude (перед Memory) |

**Взаимодействие:** При Conclude сначала извлекаются KI, затем генерируется Memory, которая **ссылается** на созданные KI и не дублирует их содержание. Memory остаётся лёгким указателем: "Создано 3 KI для видео X: traffic-analysis, packaging-audit. Незавершённый план: Layer 2 исследования не начат."

## Как LLM создаёт Knowledge Items

### Явная команда (основной flow)

```
Пользователь: "Сохрани результаты анализа по этому видео"

LLM вызывает тул saveKnowledge:
  - category: "traffic-analysis"
  - title: "Traffic Analysis — March 2026"
  - content: полный markdown с результатами
  - summary: "Browse 45%, Suggested 35% (pool shrank 12→5), Search 20%"
  - videoId: "A4SkhlJ2mK8" (или null для channel-level)
  - videoRefs: ["A4SkhlJ2mK8", "HgBEWAXuI_g"]  // упомянутые видео
  - toolsUsed: ["analyzeTrafficSources", "getMultipleVideoDetails"]
```

**Принцип LLM-as-author:** Модель, которая час разбирала видео, лучше всего знает, что важно сохранить. Расход — ~1-2K output tokens сверху, мелочь на фоне 40K результатов тулов. При контексте 150K из 200K (Sonnet) — остаётся достаточно output budget (до 16K default, до 64K extended) для генерации KI.

### При Conclude (автоматический flow)

**Ключевое решение: Conclude = последний turn чата, а не отдельный API-вызов.**

Текущий `concludeConversation.ts` — отдельный Cloud Function (`onCall`), который заново читает историю из Firestore и отправляет свежий запрос к LLM. Это cache miss: для Anthropic моделей вся conversation history (~50-150K tokens) токенизируется заново по полной цене ($0.30 за 100K вместо $0.03 из кэша — в 10 раз дороже).

Новый подход: кнопка "Memorize" отправляет обычный turn через тот же `aiChat` endpoint. Кэш тёплый, модель та же, контекст уже загружен.

```
Memorize Flow:
  1. Frontend отправляет POST на aiChat (synthetic conclude message)
  2. Backend обрабатывает через тот же streaming pipeline
  3. LLM в тёплом кэше вызывает saveKnowledge ×N + saveMemory ×1
  4. SSE events → frontend показывает результат в чате
```

#### Почему не отдельный Cloud Function

| | Отдельный CF (текущий) | Last turn (новый) |
|---|---|---|
| **Кэш** | Cold (cache miss) | Warm (cache hit) |
| **Cost (100K context, Sonnet)** | $0.30 | $0.03 |
| **Модель** | Требует Provider Router в CF | Автоматически — та же модель |
| **Контекст** | Пересобирает из Firestore | Уже в памяти LLM |
| **Прозрачность** | Молчаливый — пользователь не видит, что извлечено | Видно в чате — каждый KI как tool call |
| **Инфраструктура** | Отдельный endpoint | Переиспользует aiChat |

#### Frontend flow

```typescript
// Кнопка "Memorize" →
chatStore.sendMessage({
  text: CONCLUDE_INSTRUCTION,  // предопределённый промпт с инструкциями
  isConclude: true,            // флаг для UI styling
});
```

Conclude turn отображается в чате как обычное сообщение. Модель отвечает: "Created 3 Knowledge Items: Traffic Analysis, Packaging Audit, Channel Journey. Memory saved." — с tool call badges. Это feature, не bug — полная прозрачность того, что было сохранено.

#### Conclude instructions

Инструкции для KI/Memory extraction передаются как часть synthetic user message (не отдельный system prompt):

```
"Based on our conversation, extract Knowledge Items and Memory:
1. For each significant analysis result, call saveKnowledge with appropriate category
2. After all KI are saved, call saveMemory with a summary referencing the KI
3. Memory should reference KI by ID, not duplicate their content"
```

Tool descriptions `saveKnowledge` и `saveMemory` сами описывают формат и ожидаемые параметры — дополнительный system prompt не нужен.

#### Strip content при persist

Tool call args для `saveKnowledge` содержат полный KI content (1000-5000 слов). При сохранении conclude message в Firestore — content заменяется на reference:

```typescript
// В persistAiResponse, перед записью conclude message:
if (tc.name === 'saveKnowledge') {
  tc.args.content = `[Saved as KI ${tc.result?.id}]`;
  // summary оставляем (лёгкий, ~50 слов)
}
```

Что это даёт:
- **Провенанс:** видно, что saveKnowledge был вызван (category, title, videoId)
- **Нет bloat:** content заменён на pointer к KI документу (~20 tokens вместо ~3000)
- **History reconstruction:** при пересборке истории для summarizer — видит summary, не full content
- **Паттерн уже есть:** `stripInternalHints` убирает `_systemNote` и `_failedThumbnails` из tool results. Тот же принцип — "записывай reference, не payload"

#### Atomicity и Error Recovery

Каждый tool call (`saveKnowledge`, `saveMemory`) — атомарная операция внутри handler'а. В agentic loop LLM вызывает их последовательно. Если один упадёт — LLM получит error в tool result и может retry или сообщить пользователю.

**`saveKnowledge` handler (atomic per KI):**
- Firestore Batch: KI doc + discovery flags update
- Если batch упадёт — handler возвращает error → LLM видит и может retry

**`saveMemory` handler:**
- Single doc write
- Idempotency: проверка duplicate Memory за последние 60s (существующий паттерн)

**Failure matrix:**

| Что падает | Последствие | Recovery |
|-----------|-------------|----------|
| aiChat turn (LLM error) | Ничего не сохранено | Retry Memorize (повторный turn) |
| saveKnowledge handler | Конкретный KI не сохранён | LLM видит error, может retry в следующей итерации |
| saveMemory handler | KI сохранены, Memory нет | LLM видит error, может retry; или пользователь нажмёт Memorize снова |

**Idempotency:** При повторном Memorize — `saveKnowledge` handler проверяет, есть ли KI от этого conversationId с такой же категорией + videoId. Если да — пропускает (не дублирует).

⚠️ **Collection group index:** Idempotency guard использует `collectionGroup('knowledgeItems')` query с фильтрами `conversationId + category`. Требует composite index. Добавить в checklist при реализации.

#### MAX_AGENTIC_ITERATIONS

Текущий лимит: 10 итераций. Типичный Conclude: 3-5 KI + 1 Memory = 4-6 итераций. Укладывается с запасом.

#### Миграция с текущего concludeConversation

`concludeConversation.ts` Cloud Function удаляется после полной миграции. На переходный период — оставить как legacy fallback (frontend переключается на новый flow, старый CF ещё доступен).

## Cost Model

### Per-operation costs (при тёплом кэше)

| Операция | Input tokens | Output tokens | Cost (Sonnet 4.6) | Cost (Opus 4.6) |
|----------|-------------|---------------|-------------------|-----------------|
| `saveKnowledge` (1 KI) | ~0 (warm cache) | ~1-2K | $0.015-$0.03 | $0.025-$0.05 |
| `listKnowledge` | ~0 (warm cache) | ~500 (result) | ~$0.008 | ~$0.013 |
| `getKnowledge` | ~0 (warm cache) | ~3-5K (result) | ~$0.05-$0.08 | ~$0.08-$0.13 |

### Conclude (Memorize) — ключевой trade-off

| | Текущий (Gemini Flash CF) | Новый (last turn, chat model) |
|---|---|---|
| **Input** | 50-150K tokens (cold, полная цена) | ~0 (warm cache) |
| **Output** | ~500 tokens (одна Memory) | 10-20K tokens (3-5 KI + Memory) |
| **Total (Sonnet)** | ~$0.01-$0.02 | ~$0.15-$0.30 |
| **Total (Opus)** | — | ~$0.25-$0.50 |
| **Что получаем** | Blob 200-500 слов | Структурированные KI + Memory с refs |

**Trade-off:** Memorize стоит ~$0.15-$0.50 вместо ~$0.02 — в 10-25 раз дороже. Взамен: полные структурированные результаты анализа, переиспользуемые в будущих чатах без повторных API-вызовов.

**Контекст:** Memorize — действие 1 раз на ~5-10 разговоров, не каждое сообщение. При 20 Memorize/месяц: $3-$10/мес дополнительно (Sonnet) — доли процента от общего usage типичного пользователя.

## Как будущая LLM потребляет Knowledge Items

### Шаг 1: Discovery через флаги (zero cost)

На документе видео и канала хранятся денормализованные флаги:

```
// На документе видео (videos/{videoId}):
knowledgeItemCount: 3
knowledgeCategories: ["traffic-analysis", "packaging-audit", "suggested-pool"]
lastAnalyzedAt: Timestamp

// На документе канала (channels/{chId}):
channelKnowledgeCount: 2
channelKnowledgeCategories: ["channel-journey", "strategy-period"]
channelLastAnalyzedAt: Timestamp
```

#### Доставка флагов в LLM

**Video-level:** Флаги попадают через persistent context layer. `formatSingleVideo()` в `persistentContextLayer.ts` расширяется — к строке видео добавляются KI флаги:

```
- Published: "a playlist for a quiet morning" [id: A4SkhlJ2mK8] (slow life mode)
  — Views: 120K | 24h: +1.2K / 7d: +5.3K
  — KI: 3 items (traffic-analysis, packaging-audit, suggested-pool), last: Mar 10, 2026
```

Также доступно через `getMultipleVideoDetails` tool — handler читает документ видео и включает KI флаги в ответ.

**Channel-level:** В текущем system prompt **нет канальной метаинформации** — LLM узнаёт о канале только через video cards (поле `channelTitle`) или `getChannelOverview` tool.

Решение: добавить **channel metadata секцию** в `buildPersistentContextLayer()`. Лёгкий блок (~100 tokens), всегда присутствует:

```
### Channel
- "slow life mode" (@slowlifemode) — 1720 subscribers, 58 videos
- AI Research: 2 items (channel-journey, strategy-period), last analyzed Mar 6, 2026
```

Реализация:
- `systemPrompt.ts` — `buildSystemPrompt()` получает новый параметр: channel metadata (включая KI флаги)
- `persistentContextLayer.ts` — новая функция `formatChannelContext()`, вызывается первой (перед видео)
- `sendSlice.ts` — передаёт channel metadata из `channelStore` в `buildSystemPrompt()`
- `debugSendLog.ts` — explicit log line для channel + KI flags (для отладки)

LLM видит флаги → решает: запросить старый анализ (`listKnowledge` / `getKnowledge`) или провести свежий.

### Шаг 2: listKnowledge (лёгкий обзор)

```
LLM вызывает listKnowledge(videoId: "A4SkhlJ2mK8"):
→ Возвращает:
  [
    { title, summary, category, model, createdAt, toolsUsed },
    { title, summary, category, model, createdAt, toolsUsed },
    ...
  ]
```

~500 токенов. LLM получает оглавление — видит, что уже исследовано, когда, какой моделью.

### Шаг 3: getKnowledge (полный content)

```
LLM вызывает getKnowledge(videoId: "A4SkhlJ2mK8", categories: ["traffic-analysis"]):
→ Возвращает полный content выбранных KI
```

LLM запрашивает только те KI, которые нужны для текущей задачи. Не загружает всё подряд.

## Category Registry

### Проблема

Жёсткий enum категорий не масштабируется — мы не можем предугадать все будущие типы анализа. Но полностью свободная строка приведёт к дрейфу именований ("traffic-analysis" vs "traffic analysis" vs "Traffic Deep Dive").

### Решение: Seed Categories + Model-Driven Expansion

Один документ Firestore на канал хранит реестр категорий:

```
Firestore: users/{uid}/channels/{chId}/knowledgeCategories (один документ)
```

LLM читает реестр при старте чата (~500 tokens). При создании KI — выбирает из существующих категорий или предлагает новую. Если новая — автоматически добавляется в реестр.

### Map Structure (concurrent write safety)

Категории хранятся как **Firestore map** `{[slug]: {label, level, description}}`, а не массив. Это даёт атомарные обновления per field path без transactions:

```typescript
// Добавление новой категории — atomic, concurrent-safe:
await db.doc(registryPath).set({
  [`categories.${slug}`]: { label, level, description }
}, { merge: true });
```

Два одновременных write с разными slugs — оба применятся (Firestore мержит map fields). С одинаковым slug — last-write-wins, приемлемо (оба пишут одно и то же по смыслу).

### Slug Validation

Slug становится ключом Firestore map → частью field path при dot notation. Firestore field names не могут содержать `.` (точки). Если LLM сгенерирует slug `traffic.analysis`, запись `categories.traffic.analysis` будет интерпретирована как nested path → structural corruption.

**Обязательная валидация в `saveKnowledge` handler:**

```typescript
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;  // lowercase-kebab-case
if (!SLUG_PATTERN.test(slug)) {
  // sanitize: заменить не-kebab символы, или reject с error для LLM
}
```

Kebab-case validation на входе закрывает проблему навсегда.

### Seed Categories (стартовый набор)

**Video-level:**

| Slug | Label | Описание для LLM |
|------|-------|-------------------|
| `traffic-analysis` | Traffic Analysis | Where traffic comes from, source breakdown, dynamics over time |
| `suggested-pool` | Suggested Pool | Which videos appear in suggested, pool transitions, trajectory |
| `packaging-audit` | Packaging Audit | CTR effectiveness, title/thumbnail analysis, tag strategy |
| `audience-fit` | Audience Fit | Who watches, retention patterns, audience overlap |
| `competitive-position` | Competitive Position | How this video compares to competitors in the niche |

**Channel-level:**

| Slug | Label | Описание для LLM |
|------|-------|-------------------|
| `channel-journey` | Channel Journey | Narrative arc of channel evolution over a time period |
| `strategy-period` | Strategy Period | What was tried during a period, outcomes, lessons learned |
| `growth-mechanics` | Growth Mechanics | What drives growth, repeating patterns, flywheel effects |
| `algorithm-hypothesis` | Algorithm Hypothesis | Hypotheses about how the algorithm treats this channel |
| `niche-analysis` | Niche Analysis | Positioning among competitors, market dynamics, opportunities |

## User Flow: Video Knowledge Items (Watch Page)

### Просмотр

Watch Page получает вторую вкладку: **My Notes** | **AI Research**.

**My Notes** — существующий функционал (ручные заметки + ai-chat saves).

**AI Research** — список KI карточек:

```
┌─────────────────────────────────────────────┐
│ 📊 Traffic Analysis            Mar 10, 2026 │
│ claude-sonnet-4-6 · 3 tools                 │
│                                              │
│ Browse 45%, Suggested 35% (pool shrank       │
│ 12→5), Search 20% stable.                    │
│                                  [Open][Edit]│
└─────────────────────────────────────────────┘
```

**[Open]** — карточка раскрывается inline, показывает полный markdown через RichTextViewer. Появляется кнопка [Maximize].

**[Maximize]** — Zen Mode: fullscreen read-only overlay (Portal, backdrop blur, body scroll lock). Порт из MonkeyLearn `ProtocolInstructionViewer`.

**[Edit]** — модалка с RichTextEditor (Tiptap, WYSIWYG → Markdown). Порт из MonkeyLearn `ProtocolSettingsModal`. Пользователь может исправить неточности LLM, добавить наблюдения, удалить нерелевантное. Метаданные провенанса (model, toolsUsed, createdAt) остаются неизменными.

## User Flow: Channel Knowledge Items (Lab Page)

### Sidebar

Новый пункт **Lab** в sidebar (иконка: flask/beaker). Route: `/lab`.

### Страница

Паттерн фильтрации — аналогичный Music Page:

```
┌──────────────────────────────────────────────────┐
│ Lab                                       [+ Add]│
│                                                   │
│ [All] [channel-journey] [strategy] [growth] [...]│
│                              Sort: [Newest ▾]     │
│                                                   │
│ ┌─ KI Card ─────────────────────────────────┐    │
│ │ 📖 Channel Journey: Oct-Dec 2025          │    │
│ │ Mar 6, 2026 · claude-sonnet-4-6           │    │
│ │                                            │    │
│ │ 3 hits in 8 days drove 80% of all channel │    │
│ │ traffic. Decline was gradual...           │    │
│ │                          [Open] [Edit]     │    │
│ └────────────────────────────────────────────┘    │
│                                                   │
│ ┌─ KI Card ─────────────────────────────────┐    │
│ │ 🎯 Strategy: Copy Competitors (Oct 2025)  │    │
│ │ ...                                        │    │
│ └────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Фильтры:** chip-row по категориям (динамически из существующих KI). Сортировка: newest / oldest / по категории. Опционально: search по title/content.

**Card interactions:** идентичны Video KI — Open (inline expand), Maximize (Zen Mode), Edit (Modal).

**[+ Add]:** ручное создание KI через модалку с RichTextEditor. Позволяет добавить знания, полученные вне чата (из YouTube Analytics, из общения с другими креаторами и т.д.).

## Roadmap

### Этап 1: Data Layer
- Типы: `KnowledgeItem` (с `scope: 'video' | 'channel'`), `KnowledgeCategoryEntry`, `KnowledgeCategoryRegistry`, `KnowledgeFlags`
- Firestore: flat collection `channels/{id}/knowledgeItems/` (video + channel в одной коллекции) + `channels/{id}/knowledgeCategories`
- Frontend: `knowledgeService.ts`, `knowledgeCategoryService.ts`
- TanStack Query hook: `useKnowledgeItems(videoId?)`, `useKnowledgeCategories()`
- Seed categories document creation

### Этап 2: Chat Tools (Backend)
- 5 handler'ов в `functions/src/services/tools/handlers/knowledge/`:
  - `saveKnowledge` — создание KI (Firestore batch: KI doc + discovery flags), обновление registry при новой категории (map merge), slug validation (kebab-case regex), auto-supersede (query old KI с тем же videoId + category → `supersededBy = newKiId`), idempotency guard
  - `listKnowledge` — возврат summary + мета (лёгкий, ~500 tokens)
  - `getKnowledge` — возврат полного content по фильтрам
  - `saveMemory` — сохранение Memory с KI refs (замена логики из concludeConversation). **Conclude-only:** tool инжектится в tool list только при `isConclude: true`, в обычном чате недоступен
  - `deleteKnowledge` — (опционально) удаление устаревшего KI
- Tool definitions в `definitions.ts`
- Tool adapter для Gemini + Claude
- ⚠️ Создать composite index на collection group `knowledgeItems` (conversationId + category) для idempotency guard

### Этап 3: Conclude Migration
- Memorize = последний turn через aiChat (не отдельный Cloud Function)
- Frontend: `chatStore.sendMessage({ text: CONCLUDE_INSTRUCTION, isConclude: true })`
- Strip content при persist: `saveKnowledge` args.content → `[Saved as KI ${id}]` (reference, не payload)
- UI: conclude turn отображается в чате как обычное сообщение с tool call badges
- Миграция: `concludeConversation.ts` → legacy fallback → удаление

### Этап 4: Context Integration
- Денормализованные флаги на документах видео и канала (при `saveKnowledge`: `FieldValue.increment` + `arrayUnion`)
- **Video-level discovery:** расширение `formatSingleVideo()` в `persistentContextLayer.ts` — добавить KI флаги к строке видео
- **Video-level discovery (tool):** расширение `getMultipleVideoDetails` handler — добавить KI флаги в ответ
- **Channel-level discovery:** новая секция `formatChannelContext()` в `persistentContextLayer.ts` — channel metadata + KI флаги (~100 tokens, всегда присутствует)
- Расширение `buildSystemPrompt()` — новый параметр: channel metadata
- Расширение `sendSlice.ts` — передача channel metadata из `channelStore`
- `debugSendLog.ts` — explicit log для channel + KI flags
- Category registry injection в system prompt (~500 tokens)

### Этап 5: Video UI (Watch Page)
- Tab bar: My Notes | AI Research
- `WatchPageKnowledge.tsx` — список KI карточек
- `KnowledgeCard.tsx` — collapsed view (summary + meta)
- Inline expand с RichTextViewer

### Этап 6: Channel UI (Lab Page)
- Sidebar: новый пункт "Lab"
- `LabPage.tsx` — route `/lab`
- Фильтр-бар (chip-row по категориям, паттерн Music Page)
- Сортировка: newest / oldest / by category
- Ручное создание KI через [+ Add]

### Этап 7: View & Edit (порт из MonkeyLearn)
- `RichTextEditor` + extensions (Tiptap v3, WYSIWYG → Markdown)
- `RichTextViewer` (react-markdown, read-only)
- Zen Mode (fullscreen read-only Portal, порт из `ProtocolInstructionViewer`)
- Edit Modal (форма с RichTextEditor, порт из `ProtocolSettingsModal`)
- Зависимости: `@tiptap/react`, `@tiptap/starter-kit`, `turndown`, `marked`

### Этап 8: Production Hardening
- Тесты: handlers, services, hooks, conclude integration
- Edge cases: пустые KI, concurrent writes, large content
- Review gates: R1 (Architecture) + R2 (Production Readiness)

### Финальная стадия (market-ready vision)
- **KI versioning** — diff между версиями одного KI (как git для знаний)
- **KI recommendations** — LLM автоматически предлагает обновить устаревшие KI
- **Cross-channel KI** — знания, применимые ко всем каналам пользователя (niche insights)
- **KI export** — экспорт в PDF/Notion для работы вне приложения
- **KI search** — полнотекстовый поиск по всем KI канала
- ~~**Auto-supersede detection**~~ — перенесено в Этап 2 (`saveKnowledge` handler): детерминистично, code-driven, не требует LLM

## Technical Implementation

### Типы

```typescript
// src/core/types/knowledge.ts

interface KnowledgeItem {
  id: string;

  // Классификация
  category: string;                    // slug из registry или новый
  title: string;                       // "Traffic Analysis — March 2026"

  // Содержание
  content: string;                     // Полный markdown, НЕ сжимается
  summary: string;                     // 2-3 предложения для карточки и listKnowledge

  // Провенанс
  conversationId: string;              // откуда взялось
  model: string;                       // "claude-sonnet-4-6"
  toolsUsed: string[];                 // ["analyzeTrafficSources", "getMultipleVideoDetails"]

  // Привязка
  scope: 'video' | 'channel';         // discriminator для flat collection
  videoId?: string;                    // OWNER: "этот KI о видео X" (отсутствует у channel-level)
  videoRefs?: string[];                // REFERENCES: "этот KI упоминает видео Y, Z" (для cross-linking)

  // Время
  createdAt: Timestamp;                // когда анализ был проведён (backend, serverTimestamp)
  updatedAt?: Timestamp;               // если пользователь редактировал вручную

  // Lifecycle
  supersededBy?: string;               // ID более свежего KI, если заменён
  source: 'chat-tool' | 'conclude' | 'manual';  // как создан
}

interface KnowledgeCategoryEntry {
  slug: string;                        // 'traffic-analysis'
  label: string;                       // 'Traffic Analysis'
  level: 'video' | 'channel' | 'both';
  description: string;                 // для LLM: "Breakdown of traffic sources..."
}

interface KnowledgeCategoryRegistry {
  categories: Record<string, Omit<KnowledgeCategoryEntry, 'slug'>>;
  // Firestore map: { "traffic-analysis": { label, level, description }, ... }
  // Slug = map key → atomic per-field updates, no transactions needed
}

// Денормализованные флаги на документах видео/канала
interface KnowledgeFlags {
  knowledgeItemCount?: number;
  knowledgeCategories?: string[];
  lastAnalyzedAt?: Timestamp;
}
```

### Ключевые файлы (будут созданы при реализации)

#### Frontend

- **core/types/knowledge.ts** — Типы: KnowledgeItem, KnowledgeCategoryEntry, KnowledgeFlags
- **core/services/knowledge/knowledgeService.ts** — Firestore CRUD для KI (video + channel)
- **core/services/knowledge/knowledgeCategoryService.ts** — CRUD для category registry
- **core/hooks/useKnowledgeItems.ts** — TanStack Query: загрузка, кэширование, мутации
- **core/stores/knowledgeStore.ts** — Zustand: UI state (expand/collapse, фильтры Lab)
- **features/Knowledge/components/KnowledgeCard.tsx** — Shared: collapsed карточка
- **features/Knowledge/components/KnowledgeList.tsx** — Shared: список + фильтры
- **features/Knowledge/components/KnowledgeViewer.tsx** — Shared: Zen Mode (fullscreen read-only)
- **features/Knowledge/modals/KnowledgeItemModal.tsx** — Shared: Edit modal с RichTextEditor
- **features/Watch/components/WatchPageKnowledge.tsx** — Video-level: таб AI Research на Watch Page
- **pages/Lab/LabPage.tsx** — Channel-level: страница Lab
- **components/ui/RichTextEditor/** — Порт из MonkeyLearn: Tiptap editor

#### Backend

- **services/tools/handlers/knowledge/saveKnowledge.ts** — Handler: LLM создаёт KI
- **services/tools/handlers/knowledge/listKnowledge.ts** — Handler: summary + мета
- **services/tools/handlers/knowledge/getKnowledge.ts** — Handler: полный content
- **services/tools/definitions.ts** — +3 tool definitions (расширение существующего)
- **chat/concludeConversation.ts** — Расширение: KI extraction перед Memory (расширение существующего)

#### Firestore Collections

| Путь | Содержимое |
|------|-----------|
| `users/{uid}/channels/{chId}/knowledgeItems/{itemId}` | Все KI (flat collection, video + channel) |
| `users/{uid}/channels/{chId}/knowledgeCategories` | Category registry (один документ) |

Flat collection: video-level KI имеют `videoId` + `scope: 'video'`, channel-level — без `videoId` + `scope: 'channel'`. Запросы: `where('videoId', '==', x)` для Watch Page, `where('scope', '==', 'channel')` для Lab, без фильтра для "все KI канала".

### Архитектурные решения

| # | Решение | Обоснование |
|---|---------|-------------|
| 1 | KI — отдельный слой от Memory | Memory = субъективные выводы из разговора; KI = объективные результаты анализа. Разная природа, разный lifecycle, разный способ потребления |
| 2 | LLM-as-author (не post-processing) | Модель, глубоко погрузившаяся в анализ, лучше знает, что важно. Post-processing теряет контекст обсуждения |
| 3 | Subcollections (не embedded arrays) | Video Notes хранятся как массив на документе — нет concurrent-write safety. KI как subcollection: atomic writes, queryable, масштабируется |
| 4 | Additive (не replace) | Траектория изменений ценнее последнего снимка. KI от марта и KI от апреля — это два факта, не замена |
| 5 | Seed categories + dynamic registry | Жёсткий enum не масштабируется, свободная строка дрейфует. Registry — компромисс: консистентность + расширяемость |
| 6 | Флаги на документе + тулы по запросу | Не забивать system prompt всеми KI. Флаги (zero-cost) → listKnowledge (лёгкий) → getKnowledge (полный) |
| 7 | KI перед Memory при Conclude | Memory ссылается на KI, не дублирует. Порядок важен |
| 8 | Порт UI из MonkeyLearn | Battle-tested компоненты: RichTextEditor (Tiptap), Zen Mode (Portal), Edit Modal. Не reinvent |
| 9 | Lab как отдельная страница в sidebar | Channel KI — отдельная сущность с фильтрами/сортировкой, не помещается в Settings |
| 10 | Knowledge/ как shared feature | Используется двумя потребителями (Watch Page + Lab Page), SRP требует отдельный модуль |
| 11 | Conclude = last turn чата, не отдельный CF | Кэш тёплый (10x дешевле для Anthropic), модель та же, контекст уже загружен, один endpoint вместо двух |
| 12 | Strip KI content при persist | `saveKnowledge` args.content заменяется на `[Saved as KI ${id}]` перед записью в Firestore. Провенанс сохранён, bloat нет. Паттерн из `stripInternalHints` |
| 13 | saveKnowledge: atomic batch per KI | Каждый handler делает Firestore batch: KI doc + discovery flags. Атомарно per item — не нужен общий batch на весь conclude |
| 14 | concludeConversation.ts → удаление | Legacy CF удаляется после миграции. Вся логика Memorize переезжает в tool handlers (saveKnowledge + saveMemory) |
| 15 | Category registry: map, не array | Map `{[slug]: {...}}` — atomic per-field updates без transactions. Concurrent writes с разными slugs не конфликтуют |
| 16 | Slug validation: kebab-case | Slug = ключ Firestore map → часть field path. Точка в slug = structural corruption. Regex `/^[a-z0-9]+(-[a-z0-9]+)*$/` на входе |
| 17 | Нет `dataAsOf`, только `createdAt` | `createdAt` = "когда проведён анализ" (backend, serverTimestamp). Для snapshot-based данных дата snapshot — в content markdown. Одно поле, всегда заполнено, детерминистично |
| 18 | Auto-supersede: code-driven, не LLM | `saveKnowledge` handler автоматически ищет старый KI с тем же `videoId + category` и ставит `supersededBy`. Детерминистично, один query, не требует решения LLM |
| 19 | Conditional tool availability | `saveKnowledge` — всегда доступен (явный запрос + conclude). `saveMemory` — только при `isConclude: true` (Memory = итог разговора, не бывает mid-conversation) |

### Зависимости (новые)

| Пакет | Версия | Зачем |
|-------|--------|-------|
| `@tiptap/react` | ^3.17.0 | Rich text editor core |
| `@tiptap/starter-kit` | ^3.17.0 | Base extensions (bold, italic, lists, headings) |
| `@tiptap/extension-table` | ^3.17.0 | Table editing |
| `@tiptap/extension-color` | ^3.17.0 | Text color |
| `turndown` | ^7.2.2 | HTML → Markdown conversion |
| `marked` | ^13.0.3 | Markdown → HTML parsing |

Примечание: `react-markdown` и `rehype-raw` уже установлены (используются в WatchPageNotes).

## Взаимодействие с Memory System Roadmap

Memory System Stage 2 планирует: memory consolidation, selective injection (embedding-based), AI-driven recall (`recallMemory` tool). KI добавляет параллельную систему знаний — вот как они взаимодействуют:

### `recallMemory` — только memories, не KI

KI имеет свой discovery flow: flags на документах → `listKnowledge` → `getKnowledge`. Разные коллекции, формат, lifecycle. `recallMemory` ищет по memories — это субъективные выводы из разговоров. KI — объективные результаты анализа сущностей.

Единый поиск по обоим (unified recall) — возможная Stage 3+ фича Memory roadmap, не задача KI.

### On-demand memories + on-demand KI — граница

Если Memory Stage 2 сделает memories on-demand (selective injection вместо "все в system prompt") — механика потребления сближается с KI. Но **природа данных** остаётся разной:

- **Memory:** "мы обсуждали стратегию перехода на shorts" — субъективное, про разговор
- **KI:** "Browse 45%, Suggested 35%, pool сократился 12→5" — объективное, про сущность

Механика одна (on-demand retrieval), данные разные. Не путать записку врача с анализом крови.

### Memory consolidation + superseded KI

При consolidation memories, ссылающиеся на KI по ID, должны проверить: не помечен ли этот KI как `supersededBy`. Если да — обновить ссылку на новый KI.

**Dependency:** это задача Memory Stage 2 consolidation logic, не KI implementation. Документируем здесь как cross-feature constraint.

## Related Features

- [Memory System](../chat/context/memory-system.md) — L4 cross-conversation memory, KI дополняет (см. секцию "Взаимодействие с Memory System Roadmap")
- [YouTube Research Tools](../chat/tools/README.md) — тулы, генерирующие данные для KI
- [Video View Deltas](../video-view-deltas.md) — delta enrichment, потребитель KI при анализе
- [Competitive Intelligence](../chat/tools/layer-4-competition/competitive-intelligence.md) — competitor analysis, источник channel-level KI
