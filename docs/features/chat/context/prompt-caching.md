# Prompt Caching — Feature Doc

## Текущее состояние

**Stage 1-3 реализованы.** Оба провайдера используют prompt caching:
- **Claude:** `cache_control` breakpoints (system prompt, tools, last message). TTL = 1 час.
- **Gemini:** `CachedContent` ресурсы (system prompt + tools + history). TTL = 10 мин. Cache создаётся после первого ответа, пересоздаётся после каждого последующего. При cache hit — `cachedContentTokenCount` проходит через pipeline → savings badge в UI.

Cache-данные (`cachedTokens`, `cacheWriteTokens`) проходят end-to-end: backend → SSE → frontend → Firestore → usage logging. Стоимость в UI точная (cache read 0.1x для обоих провайдеров, cache write 2.0x только для Claude). Per-message footer показывает cache-accurate $cost с тултипом-разбивкой. ChatHeader показывает кумулятивную экономию `saved $X` зелёным.

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
| Минимум | 1,024 токена (Sonnet/Opus), 2,048 (Haiku) | 4,096 (Pro) / 1,024 (Flash) |
| TTL | 1 час | 10 мин |
| Статус | **Активен** (Stage 1) | **Активен** (Stage 3) |
| Стоимость write | 2.0x (1 час TTL) | Без per-token write cost (storage-per-hour) |
| Стоимость read | 0.1x | 0.1x |

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

Пользователь ведёт разговор. Под каждым ответом модели — точная стоимость (ниже чем без кэша) с `↓N%` индикатором для cached сообщений. В header — кумулятивная экономия `saved $X` зелёным. При наведении — подробности.

**UI — Per-Message Footer:**
```
Было:   12:34  ⚡ 12,345 • $0.0234
Стало:  12:34 · $0.004 ↓85%
```
- Raw token count убран (когнитивный диссонанс: "те же токены, другая цена?")
- Точная стоимость с учётом cache pricing, `↓N%` зелёным при cache hit
- Hover tooltip: `Input: 10,482 tokens (8,900 cached) / Output: 1,863 tokens / Cost: $0.004 (without cache: $0.023)`

**UI — ChatHeader:**
```
Было:   ⚡ 8,200 (65%) • $0.1523
Стало:  ⚡ 8,200 (65%) · $0.15 · saved $0.62
```
- Context window (⚡ tokens + %) — без изменений (про лимит, не про стоимость)
- `saved $X` — кумулятивная экономия, `--color-success`, показывается при savings > $0.01
- Hover tooltip: `Total tokens / Conversation cost / Without caching / Saved (N%)`

**Поведение при протухании кэша:** `saved`-счётчик кумулятивный (сумма savings по всем сообщениям). Cache write после протухания (2x цена) слегка уменьшает total savings, но следующие cache read (0.1x) быстро компенсируют.

**Что реализовано:**

Слой 1 — Data Pipeline (cache-данные end-to-end):
- [x] `SSETokenUsage` — `cachedTokens?`, `cacheWriteTokens?`
- [x] `ChatMessage.tokenUsage` — `cachedTokens?`, `cacheWriteTokens?`
- [x] `AiChatResult` (aliased as `AiSendResult`) — cache fields inside `normalizedUsage`
- [x] `sendSlice` — `streamAiResponse` + `persistAiResponse` расширены
- [x] `logAiUsage` + `AiUsageLog` — cache-поля в Firestore

Слой 2 — Cache-Accurate Cost Calculation:
- [x] `ModelPricing` — `cacheReadMultiplier?`, `cacheWriteMultiplier?`
- [x] Claude models — множители read: 0.1, write: 2.0
- [x] `estimateCostUsd` — cache-aware, backward-compatible
- [x] `estimateCacheSavingsUsd` — hypothetical vs actual cost

Слой 3 — UI Per-Message:
- [x] `ChatMessageList` — `useMemo` messageCost (pre-computed, no IIFE)
- [x] Tooltip via `PortalTooltip` (input/output/cached breakdown)
- [x] `↓N%` cached indicator (`--color-success`)

Слой 4 — UI ChatHeader:
- [x] `useChatDerivedState` — `totalSavings` (cost + savings in single reduce)
- [x] `ChatHeader` — `saved $X` badge (`--color-success`), tooltip pre-computed
- [x] `costTooltip` variable (clean, no inline template literals)

Слой 5 — Backend Structured Logging:
- [x] `logAiUsage` — `cachedTokens`, `cacheWriteTokens` в Firestore

**Что НЕ меняется:** context window display (⚡ tokens + %), backend caching logic, tool calling, thinking mode.

**Gemini compatibility:** Stage 3 реализован — Gemini models имеют `cacheReadMultiplier: 0.1`, UI показывает savings badge при cache hit без изменений фронта.

### Stage 3 — Gemini Context Caching ✅

**Бизнес-цель:** сократить стоимость Gemini-разговоров за счёт кэширования system prompt + tools + history между сообщениями.

**User flow:** пользователь ведёт разговор с Gemini моделью как обычно. Кэширование прозрачно — при cache hit под сообщением видна более низкая стоимость с `↓N%` badge (тот же UI что для Claude, Stage 2).

**Архитектурные решения:**
- Cache = отдельный `CachedContent` ресурс (lifecycle per-conversation)
- Cache создаётся ПОСЛЕ первого ответа (zero latency impact на первое сообщение)
- Сообщение 2+ → использует cache → ПОСЛЕ ответа пересоздаёт cache с обновлённой историей
- TTL = 10 мин (оптимально для активной сессии, минимизирует idle storage cost)
- `cacheReadMultiplier: 0.1` для всех 4 Gemini моделей (90% экономия на cached tokens)
- При summarization (`usedSummary = true`) cache отключается (semantic divergence)
- Graceful fallback на ANY cache failure — пользователь никогда не видит ошибку из-за кэша

- [x] `CachedContent` API integration в Gemini provider
- [x] Cache lifecycle manager (create/resolve/invalidate)
- [x] Threshold check: кэшировать только если cacheable content > 4,096 tokens (estimated)
- [x] Переиспользование cache между сообщениями одного разговора
- [x] Fallback: если cache expired mid-conversation — пересоздать прозрачно
- [x] `cacheReadMultiplier: 0.1` в pricing всех 4 Gemini моделей
- [x] Invalidation: model switch, system prompt change, cross-provider history gap

### Stage 4 — Production Optimization ← YOU ARE HERE

**Бизнес-цель:** автоматическая оптимизация кэширования на основе реальных паттернов использования.

- [ ] **Cache delete 403 investigation:** Gemini API возвращает 403 при `caches.delete()` — выяснить причину (model-specific restriction? API key scope?). При TTL=10 мин не критично, но блокирует увеличение TTL. Текущий workaround: не вызывать delete из `resolveCache`, только из `createCache` (та же модель → работает)
- [ ] Auto-select TTL по activity pattern (частые сообщения → 5 мин, редкие → 1 час). Зависит от решения delete 403
- [ ] Cost dashboard: cache savings per user, per model, per conversation
- [ ] Gemini: pre-warm cache при открытии существующего разговора
- [ ] A/B: сравнить стоимость с кэшем и без на реальном трафике
- [ ] Cache cleanup в `onConversationDeleted` trigger (если TTL будет увеличен — orphan storage)

---

## Связанные фичи

- [Multi-Provider Architecture](../infrastructure/multi-provider.md) — provider router, factory pattern
- [Chat Resilience](../infrastructure/chat-resilience.md) — retry взаимодействует с кэшем (retry = cache read, не write)
- [Context Token Optimization](./token-optimization.md) — compact L1 prompt уменьшает cacheable payload
- [AI Chat README](../README.md) — Stage 8 (Gemini Context Caching prerequisite)

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
| `shared/models.ts` | `ModelPricing` + `cacheReadMultiplier?` / `cacheWriteMultiplier?`; `computeIterationCost` cache-aware; Claude models — множители 0.1 / 2.0. Legacy `estimateCostUsd`/`estimateCacheSavingsUsd` удалены (Stage 3 cleanup) |
| `src/core/types/sseEvents.ts` | `SSETokenUsage` + `cachedTokens?`, `cacheWriteTokens?` |
| `src/core/types/chat/chat.ts` | `ChatMessage.tokenUsage` + cache-поля |
| `src/core/services/ai/aiProxyService.ts` | `AiChatResult` — cache fields inside `normalizedUsage` |
| `src/core/services/ai/aiService.ts` | `AiSendResult` + cache-поля |
| `src/core/stores/chat/slices/sendSlice.ts` | `streamAiResponse` / `persistAiResponse` — расширенные типы |
| `src/features/Chat/hooks/useChatDerivedState.ts` | `totalSavings` (cost + savings в одном reduce) |
| `src/features/Chat/components/ChatHeader.tsx` | `totalSavings` prop; `saved $X` badge (`--color-success`); `costTooltip` pre-computed |
| `src/features/Chat/ChatMessageList.tsx` | `messageCost` useMemo; PortalTooltip с breakdown; `↓N%` indicator (`--color-success`) |
| `src/features/Chat/ChatPanel.tsx` | Проброс `totalSavings` в ChatHeader |
| `functions/src/types.ts` | `AiUsageLog` + `cachedTokens?`, `cacheWriteTokens?` |
| `functions/src/chat/helpers.ts` | `logAiUsage` — пишет cache-поля в Firestore |
| `vitest.config.ts` | Fix: `root: '.'` в frontend project (pre-existing test isolation bug) |

### Точки изменения — Stage 3

**`functions/src/services/gemini/cacheManager.ts`** — core lifecycle:
- `resolveCache()` — optimistic cache validation (no `ai.caches.get()` call, 60s expiry buffer)
- `createCache()` — create `CachedContent` resource (threshold check, old cache delete, expiry parse)
- `invalidateCache()` — fire-and-forget delete (used only by `createCache` when replacing old cache)
- `CacheState` type — SSOT for cache state (cacheId, expiry, model, promptHash, historyLen)
- `hashPrompt()` — fast deterministic hash for system prompt change detection

**`functions/src/services/gemini/streamChat.ts`** — integration:
- Before agentic loop: `resolveCache()` check (HIT/MISS/COLD logging)
- Iteration 1 with cache: config = `{ cachedContent, ...thinkingConfig }` (NO systemInstruction, NO tools)
- Iteration 1 with cache: contents = ONLY new user message (cache is PREFIX — avoids doubling history)
- Iteration 2+: always full config + full contents (tool results not in cache)
- After agentic loop: append final model response to `agenticContents`, then fire-and-forget `createCache()` → `onCacheUpdate()` callback
- Cache eviction safety net: if iteration 1 fails with cache, retry without cache (catches NOT_FOUND from evicted resources)
- `resolveCache` never calls delete (Gemini API returns 403 on cross-context delete). Stale caches expire naturally (10 min TTL)

**`functions/src/services/gemini/context.ts`** — `GeminiProviderContext`:
- `cacheState?: CacheState` — from Firestore conversation doc
- `onCacheUpdate?: (state | null) => Promise<void>` — persist to Firestore

**`functions/src/chat/aiChat.ts`** — Firestore integration:
- Read: `convData.geminiCacheId/Expiry/Model/PromptHash/HistoryLen` → `CacheState`
- Write: `onCacheUpdate` callback → `convRef.update()` (field-level, safe with batch)
- Memory interaction: `memory.usedSummary` → cache disabled + Firestore fields cleared

**`shared/models.ts`** — pricing:
- `cacheReadMultiplier: 0.1` on all 4 Gemini models (no `cacheWriteMultiplier` — default 1.0)

### Взаимодействие с existing features

| Feature | Взаимодействие | Действие |
|---------|---------------|----------|
| Retry (`withStreamRetry`) | Retry = новый запрос → cache read (не write) | Бесплатный бонус — retry дешевле с кэшем |
| Thinking mode | `thinkingConfig` передаётся отдельно от cache — runtime only | Без изменений |
| Attachments | Картинки в messages кэшируются как часть content blocks | Без изменений |
| Agentic loop (Claude) | Tool results → incremental cache → breakpoint 3 сдвигается | Без изменений |
| Agentic loop (Gemini) | Only iteration 1 uses cache. Iterations 2+ send full contents (tool results not in cache) | Cache recreated after response with full exchange |
| Tool definitions | Статичные → внутри cache (Gemini) / breakpoint 2 (Claude) | Без изменений |
| Memory summarization | `usedSummary = true` → cache disabled + Firestore fields cleared | Prevents semantic divergence |
| Cross-provider switch | `historyLen` grew > expected (+2 per turn) → cache invalidated | Prevents stale cache from Gemini→Claude→Gemini |
| L4 Memory (saveMemory) | `memoriesSnapshot` frozen at conversation start → system prompt stable mid-chat | Prevents cascade: prefix change in system prompt would invalidate ALL downstream breakpoints (tools, history, tool results). See [Memory System](./memory-system.md) |
