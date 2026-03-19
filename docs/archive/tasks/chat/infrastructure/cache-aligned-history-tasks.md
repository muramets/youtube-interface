# Cache-Aligned History Serialization — Task Document

## Quick Context Recovery

1. **Этот файл** — `docs/features/chat/infrastructure/cache-aligned-history-tasks.md`
2. **Feature doc** — `docs/features/chat/infrastructure/cache-aligned-history.md`
3. **streamChat.ts** — `functions/src/services/claude/streamChat.ts` (buildHistory + agentic loop)
4. **aiChat.ts** — `functions/src/chat/aiChat.ts` (Firestore persistence)
5. **types.ts** — `functions/src/services/ai/types.ts` (ToolCallRecord, HistoryMessage)
6. **factory.ts** — `functions/src/services/claude/factory.ts` (ClaudeStreamChatResult → StreamResult mapping)

---

## Key Decisions (carry forward)

1. **Iteration-aware storage.** Firestore хранит `toolIterations[]` вместо плоского `toolCalls[]`. Каждый элемент = один раунд agentic loop с assistantContent + toolResults. _Why:_ побайтовый cache alignment с API format.

2. **Thinking blocks хранятся.** Включены в `assistantContent` каждой итерации. _Why:_ thinking blocks были в оригинальном запросе; их отсутствие = cache miss.

3. **Tool_use ID от API сохраняются.** Не генерировать синтетические `hist-MSG-0`. _Why:_ ID входит в cache prefix — любое расхождение = miss.

4. **Backward compatibility.** Старые сообщения с `toolCalls` → fallback на текущую логику. Новые → per-iteration reconstruction. _Why:_ нельзя мигрировать тысячи Firestore документов.

5. **`persistToolCalls` остаётся для legacy consumers.** SSE events и frontend используют плоский `toolCalls[]` для отображения badges. Не трогаем — добавляем `toolIterations` параллельно.

6. **Только Claude provider.** Gemini agentic loop может иметь другую структуру — проверим в Stage 2. Сейчас фиксим только Claude path.

7. **Content block types.** `assistantContent` хранит raw Anthropic SDK types (`ThinkingBlock`, `ToolUseBlock`). Не конвертировать в custom types — это убьёт cache alignment.

8. **`unknown[]` в interface, runtime validation при чтении.** ToolIteration использует `unknown[]` (Firestore возвращает untyped JSON). `buildHistory()` валидирует ключевые поля (`type`, `id`, `tool_use_id`) перед использованием. Без blind `as` cast. _Why:_ review F2 — type safety + Firestore denormalization.

9. **Сериализация до `deepStripUndefined`.** `toolIterations` проходит `JSON.parse(JSON.stringify())` перед добавлением в rawMsg. _Why:_ review F3 — `deepStripUndefined` может удалить поля из Anthropic SDK types (например `RedactedThinkingBlock`), ломая cache alignment. JSON roundtrip превращает SDK objects в plain objects и нормализует `undefined` → отсутствие ключа.

10. **`providerMeta` для прокидывания через factory.** `toolIterations` — Claude-specific data. Прокидывается через `providerMeta` (не через `StreamResult`). `aiChat.ts` извлекает из `providerMeta?.toolIterations`. _Why:_ review F7 — `claudeFactory` явно маппит поля; `StreamResult` — provider-agnostic; `providerMeta` — established pattern для provider-specific data.

11. **Attachments — semantic divergence задокументирована.** Legacy buildHistory добавляет attachments в assistant message (строки 242-246). Новый path — нет (attachments в user message). Разные пути создают разные форматы для legacy vs new messages. Это ожидаемо и не blocker — кэш выравнивается только для новых сообщений. _Why:_ review F4.

---

## Agent Orchestration Strategy

**Main context = executor + orchestrator.** Все фазы выполняются последовательно в main context. Subagents используются только для review gates.

---

## Phase Status

| Phase | Goal | Status |
|---|---|---|
| P1 | Types + buildHistory reconstruction | DONE |
| P2 | Agentic loop — collect iterations | DONE |
| P3 | Firestore persistence | DONE |
| P4 | Tests | DONE (9/9, 2 in backlog) |
| FINAL | Double review — R1 9/10, R2 6/6 | DONE |

## Current Test Count

> **Получить актуальный count запуском `npx vitest run --project frontend` + `npx vitest run --project functions` перед началом работы.**

---

## P1 — Types + buildHistory Reconstruction

**Goal:** Определить новый тип `ToolIteration` и научить `buildHistory()` реконструировать per-iteration messages.

### Critical Context
- `buildHistory()` находится в `streamChat.ts:226-307`
- Текущая логика для tool calls: lines 233-273 — создаёт 3 MessageParam (all tool_use, all tool_result, text)
- `HistoryMessage` в `types.ts` имеет `toolCalls?: ToolCallRecord[]`
- ⚠️ `ToolCallRecord` имеет зеркало в `src/core/types/sseEvents.ts` — НЕ ТРОГАТЬ mirror, он для frontend

### Tasks

- [ ] **T1.1** В `functions/src/services/ai/types.ts`:
  - Добавить `ToolIteration` interface:
    ```typescript
    interface ToolIteration {
      assistantContent: unknown[];  // Raw Anthropic content blocks (thinking + tool_use)
      toolResults: unknown[];       // Raw tool_result blocks
    }
    ```
  - Добавить `toolIterations?: ToolIteration[]` в `HistoryMessage`
  - НЕ менять `ToolCallRecord` — он используется frontend
  - ⚠️ Cross-ref: T3.4 должен прокинуть `toolIterations` при загрузке из Firestore

- [ ] **T1.2** В `streamChat.ts`, функция `buildHistory()`:
  - Добавить ветку: если `msg.toolIterations` существует → реконструировать per-iteration:
    ```
    for each iteration:
      validate blocks: check type/id/tool_use_id fields exist (runtime guard, not blind cast)
      push { role: "assistant", content: iteration.assistantContent }
      push { role: "user", content: iteration.toolResults }
    if msg.text:
      push { role: "assistant", content: [{ type: "text", text: msg.text }] }
    ```
  - Существующая ветка `msg.toolCalls` остаётся как fallback
  - Приоритет: `toolIterations` > `toolCalls`
  - При validation failure → fallback на `toolCalls` path с `logger.warn()`

### Verification
```bash
npx vitest run --project functions -- streamChat
npm run typecheck
```

---

## P2 — Agentic Loop: Collect Iterations

**Goal:** В agentic loop собирать `toolIterations[]` по раундам с полной структурой.

### Critical Context
- Agentic loop: `streamChat.ts:580-917`
- `agenticMessages.push()` для assistant: line ~715
- `agenticMessages.push()` для user/tool_result: line ~760
- `allToolCalls` — flat array, собирается в lines 721-759
- `iterationResult.assistantBlocks` содержит thinking + tool_use blocks
- `toolResultBlocks` содержит tool_result blocks с matching IDs
- ⚠️ НЕ менять `allToolCalls` — он используется для SSE events и `persistToolCalls`
- ⚠️ Data pipeline: `streamChat()` → `ClaudeStreamChatResult` → `claudeFactory` → `StreamResult` → `aiChat.ts`. Нужно прокинуть через ВСЕ звенья (review F7)
- ⚠️ `allToolIterations` push происходит только после успешного tool execution. Partial/stopped messages могут иметь неполные iterations — это safe, т.к. они фильтруются по `status === 'complete'` при загрузке истории (aiChat.ts ~line 155-159) (review F8)

### Tasks

- [ ] **T2.1** Добавить `allToolIterations: ToolIteration[]` рядом с `allToolCalls` (~line 583)
- [ ] **T2.2** В каждой итерации (после tool execution, ~line 760):
  ```typescript
  allToolIterations.push({
    assistantContent: iterationResult.assistantBlocks,
    toolResults: toolResultBlocks,
  });
  ```
- [ ] **T2.3** Обновить тип `ClaudeStreamChatResult` — добавить `toolIterations?: ToolIteration[]`
- [ ] **T2.4** Включить `allToolIterations` в return `streamChat()` (в `ClaudeStreamChatResult`)
- [ ] **T2.5** В `claudeFactory.ts` (~line 48-56): прокинуть через `providerMeta` (review F7):
  ```typescript
  providerMeta: {
      ...result.providerMeta,
      toolIterations: result.toolIterations,
  },
  ```
  НЕ добавлять `toolIterations` в `StreamResult` — это Claude-specific data. `providerMeta` — established pattern (уже используется для `updatedThumbnailCache` у Gemini)

### Verification
```bash
npx vitest run --project functions -- streamChat
npm run typecheck
```

---

## P3 — Firestore Persistence

**Goal:** Сохранять `toolIterations` в Firestore документ рядом с `toolCalls`.

### Critical Context
- Message persistence: `aiChat.ts:499-513`
- `persistToolCalls` строится в lines 458-466 (strips large KI content)
- ⚠️ Firestore document limit: 1MB. Thinking blocks увеличивают размер. Нужна защита.
- ⚠️ `deepStripUndefined()` применяется к документу — убедиться что не ломает content blocks
- ⚠️ `toolIterations` содержит raw Anthropic types — Firestore может не принять классы. Нужен `JSON.parse(JSON.stringify())` или ручная сериализация.

### Tasks

- [ ] **T3.1** В `aiChat.ts`, после `persistToolCalls`:
  - Получить `toolIterations` из `providerMeta?.toolIterations` (прокинуто через factory, review F7)
  - Сериализовать: `JSON.parse(JSON.stringify(toolIterations))` — превращает SDK objects в plain POJO, нормализует undefined поля. Делать **до** `deepStripUndefined` (review F3)
  - Добавить в `rawMsg.toolIterations` если не пустой
- [ ] **T3.2** Защита от 1MB limit — **try/catch pattern** (review F5):
  - Первая попытка: persist с `toolIterations`
  - При Firestore error (document too large) → retry без `toolIterations`, оставить только `toolCalls`
  - Логировать warning через `logger.warn()` при fallback
  - Без magic number threshold — Firestore сам определяет лимит
- [ ] **T3.3** В `aiChat.ts`, при загрузке истории — передавать `toolIterations` в `HistoryMessage` (если есть в Firestore doc)
  - ⚠️ Cross-ref: T1.1 добавляет `toolIterations` в HistoryMessage interface

### Verification
```bash
npx vitest run --project functions -- aiChat
npm run typecheck
```

---

## P4 — Tests

**Goal:** Покрыть roundtrip: agentic loop → Firestore → buildHistory → identical message structure.

### Tasks

- [ ] **T4.1** Unit test: `buildHistory()` с `toolIterations` — реконструирует per-iteration messages
- [ ] **T4.2** Unit test: `buildHistory()` с legacy `toolCalls` — fallback работает как раньше
- [ ] **T4.3** Unit test: `buildHistory()` roundtrip — `toolIterations` → messages → compare с оригинальными `agenticMessages`
- [ ] **T4.4** Unit test: thinking blocks сохраняются и восстанавливаются
- [ ] **T4.5** Unit test: tool_use ID от API сохраняются (не синтетические)
- [ ] **T4.6** Unit test: Firestore document too large → fallback to toolCalls only (try/catch)
- [ ] **T4.7** Unit test: tool_result с ImageBlockParam — roundtrip сохраняет структуру (review F1)
- [ ] **T4.8** Unit test: `JSON.parse(JSON.stringify())` корректно сериализует SDK types (review F3)
- [ ] **T4.9** Unit test: validation failure в buildHistory → graceful fallback на toolCalls
- [ ] **T4.10** Integration test: полный цикл stream → persist → load → buildHistory

### Verification
```bash
npx vitest run --project functions
npm run check
```

---

## FINAL — Double Review

### R1: Architecture Review

Prompt для review-агента:
```
Прочитай feature doc и task doc. Затем прочитай изменённые файлы:
- functions/src/services/ai/types.ts
- functions/src/services/claude/streamChat.ts
- functions/src/chat/aiChat.ts

Проверь:
1. buildHistory() с toolIterations создаёт ИДЕНТИЧНУЮ структуру что и agentic loop?
2. Tool_use ID от API сохраняются, не генерируются синтетические?
3. Thinking blocks сохраняются в assistantContent?
4. Backward compatibility: старые toolCalls работают как раньше?
5. Нет ли утечки Anthropic SDK types в shared/ или frontend код?
6. Try/catch fallback для document too large — работает?
7. JSON.parse(JSON.stringify()) применяется ДО deepStripUndefined? (review F3)
8. Runtime validation в buildHistory — проверяет type/id/tool_use_id? (review F2)
9. Validation failure → graceful fallback на toolCalls? (review F2)
10. Тесты покрывают roundtrip + edge cases (ImageBlockParam, large docs, validation failure)?
```

### R2: Production Readiness Review

Prompt для review-агента:
```
1. Что произойдёт если Anthropic изменит формат thinking blocks?
2. Firestore reads: toolIterations может быть large — влияет ли на latency загрузки истории?
3. Нет ли race condition между записью и чтением toolIterations?
4. Gemini provider — не сломан ли buildHistory() для Gemini messages?
5. SSE events и frontend tool call badges — не затронуты?
6. Cost: оценить реальную экономию на cache_write после деплоя
```

**Fix all findings before marking as DONE.**

---

## Post-Completion

- [ ] Обновить feature doc: "Текущее состояние" → "Реализовано"
- [ ] Перенести task doc в `docs/archive/tasks/chat/infrastructure/`
- [ ] Обновить `docs/features/chat/infrastructure/agentic-architecture.md` — добавить ссылку
- [ ] Обновить MEMORY.md
