# Edit Memory — LLM-Driven Memory Patching

> Tool `editMemory` — позволяет AI точечно редактировать любую cross-conversation memory через patch-операции (replace, insert_after, insert_before). Дополняет `saveMemory` (create/replace текущего чата) и Consolidation (массовый merge в UI).

## Текущее состояние

**Реализовано.** Tool `editMemory` — handler, tool definition, executor registration, frontend pill (с error handling), `[mem:id]` в system prompt. 14 handler tests + 7 crossConversationLayer tests.

---

## Что это и зачем

**Проблема:** LLM может сохранять memory только для текущего разговора (`saveMemory`, doc ID = conversationId). Когда в новом чате появляются данные, которые нужно добавить в memory из предыдущего чата, у модели два варианта — оба плохие:

1. **Создать новую memory** с полной копией старой + дополнения → дубликаты, растущий token budget, нужна Consolidation
2. **Игнорировать** → memory устаревает, AI теряет актуальный контекст

**Реальный кейс (trace `907cb4ef`):** модель анализировала видео Nov 19 канала slow life mode. Результат нужно было добавить в существующую memory "Channel State" (~5000 слов) из предыдущего чата. Вместо 3 точечных правок (~200 токенов output) модель перегенерировала весь документ (~5000 токенов output), потратила 13.5 минут thinking-времени, и создала дубликат.

**Аналогия:** у тебя есть блокнот с заметками о канале. Ты пришёл к аналитику (AI) с новым видео. Аналитик хочет дописать результат в блокнот — но может только вырвать страницу и переписать её целиком на новую. С `editMemory` он просто дописывает строчку в нужное место.

**Зачем:**
- Сокращает output-токены в 10-25x при обновлении существующих memories
- Устраняет дубликаты (главный источник потребности в Consolidation)
- Memory остаётся актуальной, а не устаревает между сессиями Consolidation
- Модель тратит меньше thinking-времени на recomposition

---

## User Flow

Пользователь **ничего нового не делает** — `editMemory` работает прозрачно внутри чата.

### Типичный сценарий

1. Пользователь ведёт аналитическую сессию в **новом чате** (Chat B)
2. AI видит в system prompt memories из предыдущих чатов — включая "Channel State" из Chat A
3. AI анализирует новое видео, находит данные, которые дополняют "Channel State"
4. AI вызывает `editMemory` с ID memory из system prompt + операции (insert_after, replace)
5. Memory обновляется в Firestore
6. В **следующем** чате (Chat C) AI видит обновлённую memory в system prompt
7. Текущий чат (Chat B) продолжает работать с frozen snapshot — prompt cache не ломается

### Что видит пользователь

В чате: tool call badge `editMemory` (как любой другой tool call — `saveKnowledge`, `editKnowledge`). При клике — детали: какая memory, сколько символов добавлено/удалено.

В Settings → AI Memory: обновлённый content memory с новым `updatedAt`.

---

## Дизайн

### Три инструмента — три ответственности

| Tool | Scope | Действие | Trigger |
|------|-------|----------|---------|
| `saveMemory` | Только текущий разговор (doc ID = conversationId) | Create / full rewrite | LLM (mid-chat или Memorize) |
| `editMemory` | **Любая** memory по ID | Patch (operations) | LLM (mid-chat) |
| Consolidation | N memories | Merge → delete + create | Пользователь (Settings UI) |

### Расширение permission model

Текущая модель (из memory-system.md):

| Операция | LLM (tool) | Пользователь (UI) |
|----------|:-:|:-:|
| Создать memory | `saveMemory` (текущий чат) | Settings → Add Memory |
| Полностью перезаписать | `saveMemory` (upsert) | Edit в UI |
| Точечно отредактировать | — | Edit в UI |
| Удалить | — | Delete в UI |

С `editMemory`:

| Операция | LLM (tool) | Пользователь (UI) |
|----------|:-:|:-:|
| Создать memory | `saveMemory` (текущий чат) | Settings → Add Memory |
| Полностью перезаписать | `saveMemory` (upsert, текущий чат) | Edit в UI |
| **Точечно отредактировать** | **`editMemory` (любая memory)** | Edit в UI |
| Удалить | — | Delete в UI |

**Границы:**
- LLM может **добавлять и изменять** контент в любой memory — это расширяет знания, а не уничтожает их
- LLM **не может удалять** memories — delete остаётся прерогативой пользователя
- LLM **не может редактировать protected** memories — `protected: true` → ошибка
- Если memory нужно радикально переписать — модель использует несколько replace-операций. Это намеренно сложнее, чем full rewrite через `saveMemory` — "friction by design" для cross-conversation перезаписи

### Memory ID в system prompt

Сейчас LLM не видит memory ID — только title и дату. Для `editMemory` нужен адресуемый ID.

**Изменение в `crossConversationLayer`:**

До:
```
### "Channel State: slow life mode" (2026-03-20)
[content...]
```

После:
```
### "Channel State: slow life mode" (2026-03-20) [mem:907cb4ef-c4c3-4526-bafb-55478e7d9d04]
[content...]
```

Полный UUID. Никакого short-hash resolution — прямой match по doc ID. Консистентно с `[id: videoId]` для видео в том же L4 блоке.

### Frozen snapshot и prompt cache

`memoriesSnapshot` замерзает при входе в разговор (navigationSlice). System prompt строится из snapshot. `editMemory` пишет в Firestore, но **snapshot не обновляется** — prompt cache остаётся валидным.

```
Chat B (активный)                          Firestore
┌───────────────────────────┐              ┌──────────────────────┐
│ memoriesSnapshot (frozen) │              │ conversationMemories │
│                           │   editMemory │                      │
│ Memory A: Phase 2-3       │─────────────▶│ Memory A: Phase 2-3  │
│ (версия на момент входа)  │              │ + Nov 19 (updated)   │
│                           │              │                      │
│ System prompt использует  │              │ Новые чаты увидят    │
│ frozen snapshot           │              │ обновлённую версию   │
└───────────────────────────┘              └──────────────────────┘
```

Это **тот же паттерн**, что уже работает для `saveMemory` mid-chat: Firestore обновляется, snapshot нет, prompt cache валиден, следующий чат увидит изменения.

**Нюанс: повторный edit в том же чате.** Если LLM вызывает `editMemory` дважды для одной memory — второй раз anchors из system prompt (frozen) уже не совпадают с Firestore content (первый edit изменил его). Решение: handler возвращает `contentPreview` — LLM берёт anchors для следующего edit оттуда, а не из system prompt.

### Anchor matching

LLM видит content в system prompt с обёрткой `### "Title" (date) [mem:id]\n{content}`. Raw content в Firestore — без обёртки. Tool description указывает: anchors берутся из содержимого memory (после заголовка), а не включают сам заголовок.

Паттерн идентичен `editKnowledge`: модель копирует текст из видимого контекста, handler ищет в raw content. `applyOperations` — та же утилита, те же error messages с context snippets при промахе.

### Отношение к Consolidation

`editMemory` **сокращает** потребность в Consolidation, но не заменяет:

| Без editMemory | С editMemory |
|---|---|
| Каждая сессия → новая memory с дублями | Сессия обновляет существующую memory |
| 10 сессий → 10 overlapping memories | 10 сессий → 1-3 актуальных memories |
| Consolidation нужна часто | Consolidation — редкая реорганизация |

Consolidation по-прежнему нужна для:
- Merge тематически связанных memories из разных эпох
- Удаление устаревших memories (LLM не может удалять)
- Структурная реорганизация (по топикам вместо хронологии)

---

## Roadmap

- [x] Phase 1: Memory ID exposure — `[mem:id]` в crossConversationLayer + обновление tool descriptions
- [x] Phase 2: `editMemory` handler — tool definition, handler с applyOperations, executor registration
- [x] Phase 3: Tests — handler tests (happy path, protected guard, not found, anchor errors), crossConversationLayer tests

← YOU ARE HERE

### Market-ready vision

- **Conflict detection** — если два чата одновременно editMemory одну memory, второй edit может сломать anchors. Optimistic locking через `updatedAt` timestamp (handler проверяет, что doc не изменился с момента последнего чтения).
- **Edit history** — version snapshots (subcollection) для rollback. Не нужно для MVP — пользователь может отредактировать/удалить memory в Settings UI.
- **Smart anchor suggestions** — handler подсказывает LLM ближайший match при anchor failure (уже встроено в `applyOperations`).

---

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Отдельный tool, не расширение `saveMemory` | SRP: `saveMemory` = create/replace текущего чата, `editMemory` = patch любой. Паттерн `saveKnowledge` / `editKnowledge` уже установлен в кодовой базе |
| 2 | Только operations, без full-rewrite mode | Full rewrite чужой memory = `saveMemory` territory. `editMemory` = surgical patches. Friction by design для cross-conversation rewrites |
| 3 | Полный UUID как memory ID | Прямой doc lookup, zero ambiguity. Short hash добавляет resolution логику и риск коллизий. `editKnowledge` работает с полными ID аналогично |
| 4 | Protected memories → ошибка | Консистентно с Consolidation (protected excluded). Вечные memories (User's Info, Gut Feelings) защищены от LLM-правок |
| 5 | Без versioning для MVP | Memory проще KI (нет metadata, discovery flags). Пользователь может отредактировать/удалить в Settings UI. Version history — market-ready feature |
| 6 | `contentPreview` в response | Решает проблему повторного edit в одном чате — LLM берёт anchors из preview, а не из frozen system prompt |
| 7 | Reuse `applyOperations` | Та же утилита, что в `editKnowledge`. Те же типы операций, те же error messages. Zero new code для patch logic |
| 8 | LLM не может удалять memories | Delete = необратимо. Если memory устарела — LLM редактирует content (убирает устаревшие секции через replace). Полное удаление — только пользователь через UI |
| 9 | Frozen snapshot не обновляется | Тот же паттерн, что `saveMemory` mid-chat. Prompt cache остаётся валидным. Изменения видны в следующем чате |
| 10 | Нет video ref sync | Memories не имеют `contentVideoRefs` поля (в отличие от KI). Video ссылки `[title](vid://ID)` рендерятся через `linkifyVideoRefs` at runtime прямо из markdown content. `editMemory` не нуждается в `resolveContentVideoRefs()` — нечего обновлять |

---

## Technical Implementation

### Tool definition
- `functions/src/services/tools/definitions.ts` — `editMemory` declaration: `memoryId` (string, required) + `operations` (EditOperation[], required)
- `TOOL_NAMES.EDIT_MEMORY = "editMemory"` — новый enum member

### Handler
- `functions/src/services/tools/handlers/knowledge/editMemory.ts` — handler:
  1. Resolve `memoryId` → doc ref в `conversationMemories/{memoryId}`
  2. Read doc, validate exists
  3. Check `protected !== true`
  4. `applyOperations(doc.content, operations)` — reuse из `utils/applyOperations.ts`
  5. `memoryRef.update({ content: newContent, updatedAt })`
  6. Return `{ memoryId, memoryTitle, charsAdded, charsRemoved, contentPreview }`

### Executor
- `functions/src/services/tools/executor.ts` — регистрация `[TOOL_NAMES.EDIT_MEMORY]: handleEditMemory`

### System prompt
- `src/core/ai/layers/crossConversationLayer.ts` — добавить `[mem:${m.id}]` в заголовок каждой memory

### Frontend (minimal)
- `src/features/Chat/utils/toolRegistry.ts` — регистрация `editMemory` для tool call badge rendering
- `src/features/Chat/components/toolStats/RecordComponents.tsx` — компонент отображения (memoryTitle, charsAdded/Removed)

### Tests
- `functions/src/services/tools/handlers/knowledge/__tests__/editMemory.test.ts` — handler unit tests
- `src/core/ai/layers/__tests__/crossConversationLayer.test.ts` — обновить: проверить `[mem:id]` в output

---

## Related Features

- [Memory System](./memory-system.md) — L4 cross-conversation memory; `editMemory` расширяет permission model (LLM write-own → LLM patch-any)
- [Memory Consolidation](./memory-consolidation.md) — `editMemory` снижает частоту необходимой consolidation, но не заменяет её
- [Knowledge Items — editKnowledge](../../knowledge/knowledge-items.md) — паттерн-аналог: отдельный edit tool с `applyOperations`
- [Prompt Caching](./prompt-caching.md) — frozen `memoriesSnapshot` защищает cache; `editMemory` не ломает этот механизм
