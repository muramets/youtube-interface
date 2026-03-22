# Cache-Aligned History Serialization

## Текущее состояние

**Реализовано.** `toolIterations` хранит per-iteration структуру agentic loop в Firestore (thinking blocks + original tool_use IDs + tool results). `buildHistory()` реконструирует byte-identical message sequence для prompt cache reuse. Backward compatible: старые сообщения с `toolCalls` используют legacy path. Ожидаемая экономия: ~$0.34/message (~95% reduction на cached portion).

### Backlog
- [ ] Тест: document-too-large fallback в `aiChat.ts` (требует мок Firestore `batch.commit()`)
- [ ] Тест: full integration roundtrip (stream → persist → load → buildHistory)

---

## Простыми словами

Когда Claude отвечает на сообщение, он делает несколько "раундов" — вызывает инструменты, получает результаты, думает, вызывает ещё. Вся эта цепочка сохраняется в одном формате. Но когда ты отправляешь **следующее** сообщение, Cloud Function загружает историю из базы данных и пересобирает её в **другом формате**. Anthropic API видит: "это другие данные" — и записывает кэш заново, хотя содержание идентично. Ты платишь $6/1M за данные, которые уже были оплачены.

Фикс: сохранять историю в базу **в том же формате**, в каком она отправляется в API. Тогда кэш переиспользуется между сообщениями.

---

## Проблема детально

### 5 расхождений между agentic loop и buildHistory

При генерации ответа (agentic loop) Claude видит сообщения **по раундам**:

```
msg 1: assistant → [thinking] + [tool_use id="toolu_abc"]
msg 2: user      → [tool_result id="toolu_abc"]
msg 3: assistant → [thinking] + [tool_use id="toolu_def"]
msg 4: user      → [tool_result id="toolu_def"]
msg 5: assistant → [text: финальный ответ]
```

При следующем сообщении `buildHistory()` пересобирает из Firestore **в другом формате**:

```
msg 1: assistant → [tool_use id="hist-MSG-0"] + [tool_use id="hist-MSG-1"]
msg 2: user      → [tool_result id="hist-MSG-0"] + [tool_result id="hist-MSG-1"]
msg 3: assistant → [text: финальный ответ]
```

| Аспект | Agentic loop | buildHistory |
|---|---|---|
| Кол-во сообщений | 5 (по раундам) | 3 (всё в одном) |
| Группировка tool_use | По раундам | Все в одном сообщении |
| Tool_use ID | От API (`toolu_abc`) | Синтетический (`hist-MSG-0`) |
| Thinking blocks | Есть | Потеряны |
| Role transitions | A→U→A→U→A | A→U→A |

Anthropic prompt cache — побайтовый по префиксу. Любое расхождение = полный cache miss.

### Экономический эффект

На примере реального разговора (анализ трафика видео):
- Cache miss penalty: **~$0.36** на каждое сообщение после agentic ответа
- За сессию из 5 видео: **~$1.80** потерь на перезаписи кэша
- При 30 сессиях/мес: **~$54/мес** — сопоставимо со стоимостью Tier 2

### Корень проблемы

Firestore хранит плоский массив `toolCalls[]` без:
- Границ раундов (какие tool calls к какому раунду относятся)
- Оригинальных tool_use ID от API
- Thinking blocks

`buildHistory()` не может воспроизвести оригинальную структуру — данных нет.

---

## Решение

### Новая структура в Firestore

Заменить плоский `toolCalls` на `toolIterations` — массив раундов с полной структурой:

```typescript
// Новый формат (iteration-aware)
toolIterations: [
  {
    assistantContent: [         // Все блоки assistant для этого раунда
      { type: "thinking", thinking: "..." },
      { type: "tool_use", id: "toolu_abc", name: "analyzeTraffic", input: {...} }
    ],
    toolResults: [              // Соответствующие tool_result блоки
      { tool_use_id: "toolu_abc", content: "..." }
    ]
  },
  {
    assistantContent: [
      { type: "thinking", thinking: "..." },
      { type: "tool_use", id: "toolu_def", name: "mentionVideo", input: {...} }
    ],
    toolResults: [
      { tool_use_id: "toolu_def", content: "..." }
    ]
  }
]
```

### Обратная совместимость

Старые сообщения с `toolCalls` → `buildHistory()` использует legacy path (fallback).
Новые сообщения с `toolIterations` → `buildHistory()` воспроизводит per-iteration структуру.

Legacy path поддерживает partial tool results (stopped messages): `.some()` вместо `.every()` для проверки результатов. Прерванные tool calls получают error fallback (Claude: `is_error: true`; Gemini: `{ error: "..." }` object). См. [Server-Side Abort](./server-side-abort.md).

---

## Roadmap

### Stage 1 — Cache-aligned serialization (Claude) ✅ DONE

- [x] Новый тип `ToolIteration` в `types.ts`
- [x] `streamChat.ts`: собирать `toolIterations` по раундам (tool_use ID + thinking + tool results)
- [x] `aiChat.ts`: персистить `toolIterations` в Firestore
- [x] `buildHistory()`: реконструировать per-iteration message pairs из `toolIterations`
- [x] Fallback для старых сообщений с `toolCalls`
- [x] Тесты: 9 тестов (roundtrip, validation fallback, thinking, ImageBlockParam, empty text)

### Stage 2 — Gemini alignment — NOT NEEDED

Исследовано: Gemini использует **Explicit Context Caching API** (серверный ресурс с TTL 10 мин), а не prefix-based caching. Формат `buildHistory()` **не влияет на стоимость вообще**: когда кэш валиден — `buildHistory()` не используется (запрос ссылается на кэш по ID); когда кэш истёк — full price за весь контекст при любом формате, а новый кэш создаётся из `agenticContents` (корректная per-iteration структура из agentic loop).

---

## Связанные фичи

- [Agentic Architecture](./agentic-architecture.md) — agentic loop, tool execution
- [Multi-Provider](./multi-provider.md) — provider router, Claude/Gemini
- [Token Transparency](../../chat/cost/token-transparency.md) — cost display, NormalizedTokenUsage

---

## Technical Implementation

### Файлы

| Файл | Роль |
|---|---|
| `functions/src/services/ai/types.ts` | `ToolIteration` тип, обновлённый `HistoryMessage` |
| `functions/src/services/claude/streamChat.ts` | `buildHistory()` — реконструкция; agentic loop — сборка iterations |
| `functions/src/chat/aiChat.ts` | Персистенция `toolIterations` в Firestore |
| `shared/models.ts` | Без изменений |

### Тип ToolIteration

```typescript
interface ToolIteration {
  assistantContent: unknown[];  // Raw Anthropic content blocks (thinking + tool_use)
  toolResults: unknown[];       // Raw tool_result blocks
}
```

`unknown[]` — намеренно: Firestore возвращает untyped JSON. `buildHistory()` делает runtime validation ключевых полей (`type`, `id`, `tool_use_id`) перед использованием. Без blind `as` cast.

### buildHistory flow

```
Firestore message с toolIterations?
  ├─ Да → для каждой iteration:
  │        push { role: "assistant", content: iteration.assistantContent }
  │        push { role: "user", content: iteration.toolResults }
  │        после всех iterations:
  │        push { role: "assistant", content: [{ type: "text", text }] }
  │
  └─ Нет (legacy toolCalls) → текущая логика (3 сообщения)
```
