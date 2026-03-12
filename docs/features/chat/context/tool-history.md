# Tool History — сохранение tool results между turns

## Текущее состояние

**Реализовано.** Tool results из предыдущих turns реконструируются в нативном формате провайдера (Claude: `tool_use`/`tool_result` blocks; Gemini: `functionCall`/`functionResponse` parts). Chained tool calls через turns работают. `contextBreakdown` полностью учитывает все компоненты: `historyToolResults` (реконструированные tool blocks из прошлых turns) + `toolResults` (текущий turn) + `imageCount`/`imageTokens` (включая images из agentic loop). `estimateTokens()` учитывает tool data в бюджете summarization.

---

## Простыми словами

AI ассистент записывает результаты своей работы (списки видео, данные каналов) в базу данных. Но когда пользователь задаёт следующий вопрос — ассистент открывает базу и **читает только текст своего ответа, игнорируя сырые данные**. Как если бы ты сделал Excel-таблицу, написал выводы в email, а потом потерял таблицу — остались только выводы, без цифр.

Фикс: при чтении истории — доставать данные обратно и передавать модели в нативном формате провайдера (Claude: `tool_use`/`tool_result` blocks; Gemini: `functionCall`/`functionResponse` parts).

---

## Что ломается без фикса

| Сценарий | Ожидание | Реальность |
|----------|----------|-----------|
| `browseTrendVideos` → next turn → `viewThumbnails(videoIds)` | Модель берёт IDs из прошлого turn | Модель не видит IDs, галлюцинирует или просит повторить |
| Progress bar после tool-heavy turn | ~50K tokens (реальный контекст) | ~7K tokens (toolResults: 0) |
| Summarization tool-heavy conversations | Summarizer видит tool names + key data | Summarizer видит только текст, теряет факт вызова tools |

---

## Архитектура решения

### Данные уже в Firestore

`ChatMessage.toolCalls` хранит `[{name, args, result}]` — полный snapshot каждого tool call. Проблема **не в storage, а в reading**: `aiChat.ts` mapper и `HistoryMessage` interface игнорируют поле `toolCalls`.

### Реконструкция в нативный формат

Один `ChatMessage` с `toolCalls` разворачивается в 3 сообщения провайдера:

**Claude:**
```
assistant: [tool_use_block(name, args)]        ← tool_use_id: synthetic "hist-0"
user:      [tool_result_block(id, result)]     ← matching tool_use_id
assistant: [text_block(final response)]
```

**Gemini:**
```
model: [functionCall_part(name, args)]
user:  [functionResponse_part(name, result)]
model: [text_part(final response)]
```

### Стоимость и кэширование

Tool results (25K tokens за `browseTrendVideos` с 200 видео) кэшируются провайдерами:
- **Claude:** cache_write на turn N+1 (200% цены), cache_read на turn N+2+ (10% цены)
- **Gemini:** implicit context caching

`buildMemory()` контролирует переполнение: когда history + tool results > budget → summarization сжимает старые turns.

---

## Roadmap

### Реализовано
- [x] `toolCalls` хранятся в Firestore (с момента Stage 5)
- [x] `extractCandidateVideos()` читает `toolCalls` для Layer 4 memory

### Текущий фикс (Stage 7.1) ✅
- [x] `HistoryMessage` + aiChat.ts mapper читают `toolCalls`
- [x] `estimateTokens()` учитывает tool data в бюджете
- [x] `formatMessageForSummary()` включает tool info (truncated)
- [x] Claude `buildHistory()` — реконструкция `tool_use`/`tool_result` blocks
- [x] Gemini `buildHistory()` — реконструкция `functionCall`/`functionResponse` parts
- [x] `contextBreakdown.toolResults` — вычисляется после agentic loop

### Context breakdown accuracy fix ✅
- [x] `contextBreakdown.historyToolResults` — отдельное поле для реконструированных tool blocks из прошлых turns (ранее не учитывались в breakdown)
- [x] `contextBreakdown.imageCount`/`imageTokens` обновляются после agentic loop (images из `viewThumbnails` → `visualContextUrls` → `ImageBlockParam`)
- [x] `StreamResult.agenticImages` — провайдеры возвращают { count, tokens } из loop
- [x] `parseYouTubeThumbnailSize(url)` — парсинг URL для точной оценки (mqdefault=170 tokens, maxresdefault=1360 tokens)
- [x] Frontend: новый сегмент "History tools" (`bg-purple-400`) в TokenBreakdown

---

## Связанные фичи

- [Agentic Architecture](../infrastructure/agentic-architecture.md) — agentic loop, tool execution
- [Token Optimization](./token-optimization.md) — compact L1, on-demand details
- [Token Transparency](../cost/token-transparency.md) — contextBreakdown, progress bar
- [Memory System](./memory-system.md) — L3 summarization, buildMemory()
- [Prompt Caching](./prompt-caching.md) — Claude cache breakpoints BP1/BP2/BP3

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/ai/types.ts` | `HistoryMessage` — поле `toolCalls`; `StreamResult` — поле `agenticImages` |
| `functions/src/chat/aiChat.ts` | Mapper: читает `toolCalls`; contextBreakdown: `historyToolResults` + agentic images merge |
| `functions/src/services/claude/streamChat.ts` | `buildHistory()` — реконструкция; agentic image tracking с `parseYouTubeThumbnailSize` |
| `functions/src/services/gemini/streamChat.ts` | `buildHistory()` — реконструкция; agentic image tracking |
| `functions/src/services/memory.ts` | `estimateTokens()` + `formatMessageForSummary()` |
| `shared/imageTokens.ts` | `parseYouTubeThumbnailSize()` — URL → dimensions для точной оценки tokens |
| `shared/models.ts` | `ContextBreakdown.historyToolResults` — новое поле |

### Message structure in Claude history (после фикса)

```
messages[0]: user     "Покажи топ видео"
messages[1]: assistant [tool_use("browseTrendVideos", args)]
messages[2]: user     [tool_result(result JSON)]              ← 25K tokens, cached after first turn
messages[3]: assistant [text("Here are the top videos...")]   ← BP3 lands here (second-to-last)
messages[4]: user     "Покажи обложки первых 5"               ← current message (fresh)
```

### Tests

| Файл | Что тестирует |
|------|--------------|
| `functions/src/services/__tests__/memory.test.ts` | estimateTokens с toolCalls, formatMessageForSummary с tool info |
| `functions/src/services/claude/__tests__/streamChat.test.ts` | buildHistory реконструкция tool blocks |
| `functions/src/services/gemini/__tests__/streamChat.contract.test.ts` | buildHistory реконструкция function parts |
| `functions/src/chat/__tests__/aiChat.thinkingPersistence.test.ts` | mapper reads toolCalls, contextBreakdown.toolResults |
