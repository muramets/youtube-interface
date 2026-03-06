# Prompt Caching — Feature Doc

## Текущее состояние

**Stage 1-2 реализованы.** Claude-запросы используют `cache_control` breakpoints (system prompt, tools, last message). TTL = 1 час. Cache-данные (`cachedTokens`, `cacheWriteTokens`) проходят end-to-end: backend → SSE → frontend → Firestore → usage logging. Стоимость в UI точная (cache read 0.1x, cache write 2.0x). Per-message footer показывает cache-accurate $cost с тултипом-разбивкой. ChatHeader показывает кумулятивную экономию `saved $X` зелёным. Gemini пока без кэширования (Stage 3 — при росте prompt до 32K+).

**Token Transparency интеграция:** cache pricing теперь в `computeIterationCost()` — единственное место с pricing logic. `NormalizedTokenUsage.billing.cost` включает `cached` и `cacheWrite` стоимости per-iteration. `withoutCache` показывает гипотетическую стоимость без кэша. Подробности: `docs/features/chat/token-transparency.md`.

---

## Зачем это нужно

Prompt caching — способ сказать API "эту часть запроса ты уже видел, не обрабатывай заново". API кэширует помеченные блоки и при повторном запросе читает их из кэша за 10% от обычной цены.

**Экономика для типичного аналитического разговора** (10 сообщений, system prompt 6K, 5 картинок в первом сообщении):

| | Без кэша | С кэшем | Экономия |
|---|---|---|---|
| System + tools (8K × 10) | 80K tokens full | 8K write + 72K × 10% | ~82% |
| Картинки (25K × 10) | 250K tokens full | 25K write + 225K × 10% | ~87% |
| **Итого input** | **330K tokens** | **~66K effective** | **~80%** |

Для Sonnet 4.6 ($3/M input): $0.99 → $0.20 за разговор.

---

## Два провайдера — два механизма

| | Claude (Anthropic) | Gemini (Google) |
|---|---|---|
| Механизм | `cache_control` inline в запросе | Отдельный `CachedContent` ресурс через API |
| Минимум | 1,024 токена (Sonnet/Opus), 2,048 (Haiku) | 32,768 токенов |
| TTL | 5 мин (default) или 1 час | Настраиваемый |
| Когда включать | **Сейчас** (system prompt ~6-8K > 1,024) | Когда system prompt вырастет до 32K+ (Stage 8 Chat) |
| Стоимость write | 1.25x (5 мин) или 2.0x (1 час) | Отдельная тарификация |
| Стоимость read | 0.1x | Зависит от модели |

---

## Roadmap

### Stage 1 — Claude Prompt Caching ✅

**Бизнес-цель:** сократить стоимость Claude-разговоров на ~80% без изменения пользовательского опыта.

**User flow:** пользователь ведёт разговор как обычно. Кэширование работает прозрачно — единственное видимое изменение: в токен-метриках появляются `cache read` / `cache write` значения.

**Что меняется:**

1. **System prompt** — из строки в массив блоков с `cache_control`
2. **Tool definitions** — `cache_control` на последнем tool
3. **Message history** — `cache_control` на последнем сообщении перед новым user message (incremental caching)
4. **TTL: 1 час** — пользователь ведёт аналитические разговоры с паузами на обдумывание

**Стратегия breakpoints (max 4 у Claude):**
```
Breakpoint 1: system prompt          — статичный, кэшируется на весь разговор
Breakpoint 2: tool definitions       — статичные, кэшируются на весь разговор
Breakpoint 3: последний msg истории  — сдвигается, incremental cache
Breakpoint 4: (резерв)
```

**Что НЕ меняется:** пользовательский опыт, формат ответов, tool calling, thinking mode.

- [x] Трансформация system prompt: `string` → `TextBlockParam[]` с `cache_control`
- [x] `cache_control` на последнем tool definition
- [x] Incremental caching: `cache_control` на последнем content block перед новым user message
- [x] TTL: 1 час (`{ type: "ephemeral", ttl: "1h" }`)
- [x] Расширить `TokenUsage`: добавить `cacheWriteTokens` (из `cache_creation_input_tokens`)
- [x] Логирование: `[claude:streamChat] Cache: {cacheRead} read, {cacheWrite} write tokens`
- [x] Тесты: 13 тестов — breakpoint placement, edge cases, token metrics accumulation

### Stage 2 — Cache Metrics & UI ✅

**Бизнес-цель:** пользователь видит точную стоимость (с учётом кэша) и кумулятивную экономию — без технического жаргона.

**Принцип дизайна:** zero cognitive load. Никаких "hit rate", "cache read/write", "tokens saved". Только деньги — универсально понятная метрика. Детали доступны через hover (progressive disclosure).

**User flow:**

Пользователь ведёт разговор. Под каждым ответом модели — точная стоимость (ниже чем без кэша) с `↓N%` индикатором для cached сообщений. В header — кумулятивная экономия `saved €X` зелёным. При наведении — подробности.

**UI — Per-Message Footer:**
```
Было:   12:34  ⚡ 12,345 • €0.0234
Стало:  12:34 · €0.004 ↓85%
```
- Raw token count убран (когнитивный диссонанс: "те же токены, другая цена?")
- Точная стоимость с учётом cache pricing, `↓N%` зелёным при cache hit
- Hover tooltip: `Input: 10,482 tokens (8,900 cached) / Output: 1,863 tokens / Cost: €0.004 (without cache: €0.023)`

**UI — ChatHeader:**
```
Было:   ⚡ 8,200 (65%) • €0.1523
Стало:  ⚡ 8,200 (65%) · €0.15 · saved €0.62
```
- Context window (⚡ tokens + %) — без изменений (про лимит, не про стоимость)
- `saved €X` — кумулятивная экономия, `--color-success`, показывается при savings > €0.01
- Hover tooltip: `Total tokens / Conversation cost / Without caching / Saved (N%)`

**Поведение при протухании кэша:** `saved`-счётчик кумулятивный (сумма savings по всем сообщениям). Cache write после протухания (2x цена) слегка уменьшает total savings, но следующие cache read (0.1x) быстро компенсируют.

**Что реализовано:**

Слой 1 — Data Pipeline (cache-данные end-to-end):
- [x] `SSETokenUsage` — `cachedTokens?`, `cacheWriteTokens?`
- [x] `ChatMessage.tokenUsage` — `cachedTokens?`, `cacheWriteTokens?`
- [x] `StreamChatResult`, `AiSendResult` — cache-поля
- [x] `sendSlice` — `streamAiResponse` + `persistAiResponse` расширены
- [x] `logAiUsage` + `AiUsageLog` — cache-поля в Firestore

Слой 2 — Cache-Accurate Cost Calculation:
- [x] `ModelPricing` — `cacheReadMultiplier?`, `cacheWriteMultiplier?`
- [x] Claude models — множители read: 0.1, write: 2.0
- [x] `estimateCostEur` — cache-aware, backward-compatible
- [x] `estimateCacheSavingsEur` — hypothetical vs actual cost

Слой 3 — UI Per-Message:
- [x] `ChatMessageList` — `useMemo` messageCost (pre-computed, no IIFE)
- [x] Tooltip via `PortalTooltip` (input/output/cached breakdown)
- [x] `↓N%` cached indicator (`--color-success`)

Слой 4 — UI ChatHeader:
- [x] `useChatDerivedState` — `totalSavingsEur` (cost + savings in single reduce)
- [x] `ChatHeader` — `saved €X` badge (`--color-success`), tooltip pre-computed
- [x] `costTooltip` variable (clean, no inline template literals)

Слой 5 — Backend Structured Logging:
- [x] `logAiUsage` — `cachedTokens`, `cacheWriteTokens` в Firestore

**Что НЕ меняется:** context window display (⚡ tokens + %), backend caching logic, tool calling, thinking mode.

**Gemini compatibility:** Gemini models без `cacheReadMultiplier`/`cacheWriteMultiplier` → savings = 0 → badge не показывается. Stage 3 подхватит без изменений фронта.

### Stage 3 — Gemini Context Caching ← YOU ARE HERE

**Бизнес-цель:** когда system prompt (L1 context + L4 memory + tools) вырастет до 32K+, включить Gemini caching.

**Предпосылки:** реализация Stage 8 Chat (вся база видео в prompt, ~32K+ tokens).

**Архитектурные отличия от Claude:**
- Создание `CachedContent` ресурса через отдельный API-вызов
- Ресурс живёт отдельно от запросов, имеет свой lifecycle (create, get, update TTL, delete)
- В `generateContent` передаётся `cachedContent: "cachedContents/{id}"`
- Нужна стратегия lifecycle management: когда создавать, когда обновлять, когда expiry

- [ ] `CachedContent` API integration в Gemini provider
- [ ] Cache lifecycle manager (create/refresh/expire)
- [ ] Threshold check: кэшировать только если cacheable content > 32K tokens
- [ ] Переиспользование cache между сообщениями одного разговора
- [ ] Fallback: если cache expired mid-conversation — пересоздать прозрачно

### Stage 4 — Production Optimization

**Бизнес-цель:** автоматическая оптимизация кэширования на основе реальных паттернов использования.

- [ ] Auto-select TTL по activity pattern (частые сообщения → 5 мин, редкие → 1 час)
- [ ] Cost dashboard: cache savings per user, per model, per conversation
- [ ] Gemini: pre-warm cache при открытии существующего разговора
- [ ] A/B: сравнить стоимость с кэшем и без на реальном трафике

---

## Связанные фичи

- [Multi-Provider Architecture](./multi-provider.md) — provider router, factory pattern
- [Chat Resilience](./chat-resilience.md) — retry взаимодействует с кэшем (retry = cache read, не write)
- [Context Token Optimization](./context-token-optimization.md) — compact L1 prompt уменьшает cacheable payload
- [AI Chat README](./README.md) — Stage 8 (Gemini Context Caching prerequisite)

---

## Technical Implementation

### Точки изменения — Stage 1

**`functions/src/services/claude/streamChat.ts`** — основные изменения:

1. System prompt: `system: string` → `system: TextBlockParam[]`
```typescript
// Было:
...(systemPrompt ? { system: systemPrompt } : {}),

// Станет:
...(systemPrompt ? {
    system: [{
        type: "text" as const,
        text: systemPrompt,
        cache_control: { type: "ephemeral", ttl: "1h" },
    }],
} : {}),
```

2. Tools: `cache_control` на последнем tool
```typescript
// В toClaudeTools() или при сборке params:
if (tools.length > 0) {
    tools[tools.length - 1].cache_control = { type: "ephemeral", ttl: 3600 };
}
```

3. Messages: incremental caching
```typescript
// Перед вызовом streamIteration, пометить последний content block
// последнего assistant message в истории
```

**`functions/src/services/ai/types.ts`** — расширение TokenUsage:
```typescript
interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens?: number;       // cache reads (уже есть)
    cacheWriteTokens?: number;   // cache writes (добавить)
}
```

**`functions/src/services/claude/streamChat.ts`** — извлечение cache write:
```typescript
// В finalMessage handler:
const cacheRead = message.usage.cache_read_input_tokens ?? 0;
const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
tokenUsage = {
    // ...existing fields...
    cachedTokens: cacheRead > 0 ? cacheRead : undefined,
    cacheWriteTokens: cacheWrite > 0 ? cacheWrite : undefined,
};
```

### Точки изменения — Stage 2

**Изменённые файлы:**

| Файл | Изменение |
|---|---|
| `shared/models.ts` | `ModelPricing` + `cacheReadMultiplier?` / `cacheWriteMultiplier?`; `estimateCostEur` cache-aware; новая `estimateCacheSavingsEur`; Claude models — множители 0.1 / 2.0 |
| `src/core/types/sseEvents.ts` | `SSETokenUsage` + `cachedTokens?`, `cacheWriteTokens?` |
| `src/core/types/chat/chat.ts` | `ChatMessage.tokenUsage` + cache-поля; реэкспорт `estimateCacheSavingsEur` |
| `src/core/services/ai/aiProxyService.ts` | `StreamChatResult` + cache-поля |
| `src/core/services/ai/aiService.ts` | `AiSendResult` + cache-поля |
| `src/core/stores/chat/slices/sendSlice.ts` | `streamAiResponse` / `persistAiResponse` — расширенные типы |
| `src/features/Chat/hooks/useChatDerivedState.ts` | `totalSavingsEur` (cost + savings в одном reduce) |
| `src/features/Chat/components/ChatHeader.tsx` | `totalSavingsEur` prop; `saved €X` badge (`--color-success`); `costTooltip` pre-computed |
| `src/features/Chat/ChatMessageList.tsx` | `messageCost` useMemo; PortalTooltip с breakdown; `↓N%` indicator (`--color-success`) |
| `src/features/Chat/ChatPanel.tsx` | Проброс `totalSavingsEur` в ChatHeader |
| `functions/src/types.ts` | `AiUsageLog` + `cachedTokens?`, `cacheWriteTokens?` |
| `functions/src/chat/helpers.ts` | `logAiUsage` — пишет cache-поля в Firestore |
| `vitest.config.ts` | Fix: `root: '.'` в frontend project (pre-existing test isolation bug) |

### Взаимодействие с existing features

| Feature | Взаимодействие | Действие |
|---------|---------------|----------|
| Retry (`withStreamRetry`) | Retry = новый запрос → cache read (не write) | Бесплатный бонус — retry дешевле с кэшем |
| Thinking mode | `thinking` param не влияет на cache prefix | Без изменений |
| Attachments | Картинки в messages кэшируются как часть content blocks | Без изменений |
| Agentic loop | Tool results добавляются в messages → incremental cache растёт | Breakpoint 3 сдвигается на каждой итерации |
| Tool definitions | Статичные → идеальный кандидат для кэширования | Breakpoint 2 |
