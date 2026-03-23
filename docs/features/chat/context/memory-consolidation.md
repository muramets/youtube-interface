# Memory Consolidation

> User-triggered объединение нескольких L4 memories в компактные, актуальные memories с AI-ассистентом и полным пользовательским контролем.

## Текущее состояние

Phases 0-3 реализованы + post-release polish. Полный user flow: Settings → AI Memory → Consolidate → выбор memories → модель → intention → Generate → preview/edit (с cost) → Save. Protected memories (lock toggle) исключены из consolidation. Cost tracking: CF вычисляет `costUsd` через `computeIterationCost` и возвращает в preview. Thinking не используется — structured JSON output (native enforcement per provider) несовместим с thinking у Claude. CF logging: `[consolidate]` теги с request/response/error метриками.

---

## Что это и зачем

**Проблема:** по мере работы с каналом накапливаются десятки L4 memories — каждая аналитическая сессия создаёт свою. Промежуточные memories устаревают (например, "Phase 2 done, Phase 3 next" — бесполезно после завершения Phase 3), дублируют друг друга, и занимают всё больше токенов в system prompt каждого чата.

**Аналогия:** у тебя на столе 15 стикеров с заметками за месяц. Половина — промежуточные ("позвонить Пете" — уже позвонил), некоторые повторяются. Consolidation — это сесть, пересмотреть все стикеры, выбросить устаревшие, объединить связанные, и получить 3-4 чистые карточки с актуальной информацией.

**Зачем:**
- Memories растут линейно, но пользователь не может попросить LLM в одном чате отредактировать memory из другого — LLM имеет write-доступ только к memory текущего разговора
- Все L4 memories инжектируются в system prompt → токены растут → стоимость растёт → меньше места для истории
- Устаревшие memories могут вводить AI в заблуждение (противоречивые факты из разных сессий)

**Триггер для реализации:** `ContextBreakdown.memory` в Token Transparency показывает >30-50% контекстного бюджета, или пользователь видит, что memories стали неуправляемыми.

---

## User Flow

### 1. Инициация

Пользователь открывает **Settings → AI Memory** (существующая страница со списком всех L4 memories). Видит кнопку **[Consolidate]** рядом с "Add Memory".

### 2. Modal — настройка

Открывается modal с двумя секциями:

**Выбор memories:**
- Список всех memories с checkboxes. По умолчанию все unprotected — отмечены.
- Protected memories (иконка замка) — excluded, checkbox disabled. Пользователь может protect/unprotect memories заранее через toggle на individual memory.
- Пользователь может вручную exclude/include любую unprotected memory.
- Минимум 2 memories должны быть отмечены для consolidation.

**Model picker:**
- Выбор модели (из тех же опций, что в chat). По умолчанию — текущая модель чата.
- Consolidation — аналитическая задача; пользователь выбирает trade-off cost/quality.

**Intention field:**
- Textarea с placeholder: "What should the AI focus on? E.g.: merge session summaries, keep only current decisions, separate facts from hypotheses..."
- Опциональное, но рекомендуемое. Без intention LLM делает best-effort merge.

Кнопка **[Generate]** запускает consolidation.

### 3. LLM processing (CF — AI only)

Frontend отправляет HTTP request в Cloud Function `consolidateMemories`. CF **только генерирует** — вызывает provider router с выбранной моделью и возвращает JSON с предложенными новыми memories. CF не читает и не пишет в Firestore (memories приходят от фронтенда в request body).

```
Frontend (memories + model + intention)
  → CF consolidateMemories
  → Input validation (auth + model whitelist + content limits)
  → Provider Router → Gemini / Claude
  → JSON response { memories[], reasoning, noChangesNeeded }
  → Frontend (preview modal)
```

**Input validation (CF):**
- **Auth:** Firebase Auth token — только авторизованный пользователь (стандартная guard, как на `aiChat`)
- **Model whitelist:** `model` проверяется против `MODEL_REGISTRY` — отклонить несуществующие модели
- **Content limits:** суммарный размер memories проверяется против `contextLimit` выбранной модели из `MODEL_REGISTRY`. Формула: `maxInputChars = modelConfig.contextLimit × CHARS_PER_TOKEN × 0.7` (30% резерв на system prompt + output). Если memories не помещаются → ошибка с human-readable сообщением ("Selected memories exceed the context window of {model}. Deselect some memories or choose a model with a larger context."). Один source of truth: при обновлении модели провайдером → обновляем `contextLimit` в `MODEL_REGISTRY` → лимит автоматически пересчитывается.

**Возможные исходы:**
- **Merge:** 5 memories → 2 новых (по топикам)
- **No-op:** LLM решает, что memories не пересекаются → `noChangesNeeded: true` → modal показывает "These memories don't overlap enough to consolidate" → кнопка Close
- **Validation error:** memories превышают context limit модели → ошибка до LLM вызова (zero cost)
- **Error:** timeout / rate limit → стандартная обработка ошибок

### 4. Preview + Edit

Modal переходит в preview state:

**Before (затронутые memories):**
- Список с strikethrough — что будет заменено. Каждая memory: title + первые 2 строки content.

**After (новые memories):**
- 1-N карточек с title + full content. Каждая — editable (inline textarea или RichTextEditor).
- Пользователь может отредактировать title и content каждой новой memory перед сохранением.
- LLM reasoning отображается как muted text над карточками — пользователь понимает логику merge.

### 5. Сохранение (Frontend — Firestore batch)

Frontend выполняет atomic Firestore write через новый dedicated метод `applyConsolidation()` в memory service (рядом с существующими `createMemory` / `deleteMemory`).

**Почему не существующие single-write методы:** `createMemory()` и `deleteMemory()` — каждый отдельный Firestore write. Вызывать их в цикле = не atomic. Нужен один `writeBatch()` с deletes + creates.

```typescript
// New method in memory service (alongside existing CRUD)
async function applyConsolidation(
    userId: string,
    channelId: string,
    toDelete: string[],           // IDs of source memories
    toCreate: ConsolidatedMemory[] // { title, content }
): Promise<void> {
    const batch = writeBatch(db);
    // deletes
    for (const id of toDelete) {
        batch.delete(doc(memoriesRef, id));
    }
    // creates
    for (const memory of toCreate) {
        const ref = doc(memoriesRef); // auto-ID
        batch.set(ref, {
            conversationTitle: memory.title,
            content: memory.content,
            source: 'consolidated',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }
    await batch.commit();
}
```

**[Save]** → `applyConsolidation()` — atomic: либо все deletes + creates, либо ничего.

**[Cancel]** — modal закрывается, ничего не меняется.

**Разделение ответственности:**
- **CF** = pure AI function (принимает текст, возвращает текст). Stateless, не трогает Firestore.
- **Frontend** = CRUD owner. Читает memories из store, отправляет в CF, записывает результат в Firestore.
- `applyConsolidation()` живёт рядом с `createMemory` / `deleteMemory` в memory service. Naming: service, не `ChatService` — memories вышли за рамки чата (manual creation, consolidation, settings UI). Точное расположение определится при имплементации.

**⚠️ Naming concern:** текущий `ChatService` (`src/core/services/ai/chatService.ts`) исторически содержит memory CRUD, хотя memories давно не chat-only. Переименование сервиса — отдельная задача, не блокирует consolidation.

---

## Protected Memories

**Зачем:** некоторые memories — вечный контекст (User's Info, User's Gut Feelings). Их нельзя мержить или удалять при consolidation.

**Как работает:**
- Toggle "Protected" (иконка замка) на individual memory card в AI Memory UI
- Protected memories исключены из consolidation (checkbox disabled, визуально отличаются)
- Protected flag — поле `protected: boolean` на memory doc в Firestore
- LLM не видит protected memories при consolidation (не передаются в prompt)
- Protected memories по-прежнему инжектируются в system prompt чатов (L4 injection не меняется)

---

## Отличие от существующих механизмов

| | Memorize (L4) | Edit Memory | Consolidation |
|---|---------------|-------------|---------------|
| **Trigger** | Кнопка в чате | Click на memory | Кнопка в Settings |
| **Input** | Текущий разговор | Один memory | N memories + intention |
| **Output** | 1 memory + N KI | Обновлённый memory | 1-N новых memories |
| **Scope** | Один разговор | Один memory | Все (или выбранные) memories |
| **Кто генерирует** | Chat model (warm cache) | Пользователь вручную | Выбранная модель (cold call) |
| **Provider** | Provider-agnostic (aiChat) | N/A (manual edit) | Provider-agnostic (provider router) |
| **AI call** | CF `aiChat` (streaming + tools) | N/A | CF `consolidateMemories` (one-shot, no tools) |
| **Firestore write** | CF handler `saveMemory` | Frontend `ChatService` | Frontend `applyConsolidation()` (atomic `writeBatch`) |

---

## Consolidation Prompt

### System Prompt (`CONSOLIDATION_SYSTEM_PROMPT`)

```
You are a memory consolidation system. Your task is to analyze multiple conversation memories
and produce a smaller set of comprehensive, up-to-date memories that preserve all valuable information.

This is SYNTHESIS, not compression. You must:
1. Identify overlapping topics across memories and merge them into coherent units
2. Resolve contradictions — when memories disagree, the MORE RECENT one wins (check dates)
3. Remove obsolete information (completed action items, superseded decisions)
4. Preserve ALL specific details: video titles, numbers, dates, metric values, percentages
5. Keep the chronological context — when a decision was made matters

Structure each output memory with these markdown headers (omit empty sections):
## Decisions — what was chosen and why (with dates)
## Insights — patterns observed, lessons learned
## Channel State — current snapshot of metrics and situation
## Action Items — pending tasks (remove completed ones)
## Open Questions — unresolved issues

Video & Knowledge Item references:
- Input memories contain internal links: [video title](vid://VIDEO_ID) and [KI title](ki://kiId).
  These are rendered as interactive UI elements (clickable chips with tooltips).
- PRESERVE these links exactly as they appear — same title, same vid:// or ki:// URI, same markdown syntax.
- Do NOT convert vid:// links to plain text, YouTube URLs, or any other format.
- Do NOT strip or rewrite ki:// links.
- When merging content that references the same video from multiple memories, keep one [title](vid://ID) link.
- When referencing videos in newly written text, use [video title](vid://VIDEO_ID) format.

Rules:
- Output 1-5 memories. Split by TOPIC, not by source conversation.
  Good split: "Traffic Patterns" + "Content Strategy" + "Open Questions"
  Bad split: "From conversation 1" + "From conversation 2"
- Each memory: 100-500 words. Shorter is better if nothing is lost.
- If memories don't overlap and have no obsolete content — return them unchanged
  and set "noChangesNeeded" to true.
- Language: match the language of the input memories.
- Do NOT invent new insights — only reorganize and synthesize existing ones.
- Do NOT use vague references like "the video" — always use exact titles and vid:// links.
- When merging overlapping action items or open questions, keep the most specific formulation.

Return a JSON object with these fields:
- "memories": array of { "title": string, "content": string }
- "reasoning": string — 1-3 sentences explaining your consolidation logic
- "noChangesNeeded": boolean — true ONLY if input memories are already optimal
  When noChangesNeeded is true, set memories to an empty array [].
  When noChangesNeeded is false, memories MUST contain at least one item.
```

### User Prompt (формируется динамически в CF)

```
Memories to consolidate:

---
### "Session: Phase 2 Traffic Analysis" (2026-01-15)
{content of memory 1}

---
### "Session: Phase 3 — Nov 7, 8, 9" (2026-02-20)
{content of memory 2}

---
### "User's Gut Feelings About the Channel" (2026-01-05)
{content of memory 3}

---

User's consolidation intent:
"Merge all session memories into topical summaries, keep open questions separate"
```

**Формат входных memories** консистентен с `crossConversationLayer.ts` — `### "Title" (date)\n{content}`. LLM видит memories в том же формате, в котором они инжектируются в чаты.

**Порядок:** memories отсортированы хронологически (oldest first) — frontend подписка использует `orderBy('createdAt', 'asc')`. CF сохраняет этот порядок без пересортировки. LLM использует позицию как proxy для recency: последняя memory = самая актуальная. Это важно для правила "при противоречии побеждает более новая memory".

**Intention** добавляется в конец user prompt только если пользователь его указал.

### Structured Output — Native per Provider

Каждый провайдер использует свой native механизм structured output, абстрагированный через `generateText()`:

- **Gemini:** `responseMimeType: "application/json"` + `responseSchema` (как уже используется в `generateConcludeSummary`)
- **Claude:** tool_use с JSON schema (Anthropic recommended pattern — define tool with schema, force `tool_choice`, extract result)

Prompt по-прежнему содержит JSON-инструкции ("Return a JSON object...") как guidance для модели — это помогает с качеством output, даже когда native enforcement гарантирует валидность структуры.

**Response schema (shared, provider-agnostic):**
```typescript
const CONSOLIDATION_SCHEMA = {
    type: "object",
    properties: {
        memories: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    content: { type: "string" },
                },
                required: ["title", "content"],
            },
        },
        reasoning: { type: "string" },
        noChangesNeeded: { type: "boolean" },
    },
    required: ["memories", "reasoning", "noChangesNeeded"],
};
```

**Парсинг ответа:**
1. Provider-native response → JSON (гарантирован provider enforcement)
2. Runtime валидация структуры (`memories[]` non-empty, titles non-empty)
3. Fallback при неожиданной ошибке — вернуть ошибку пользователю

### Prerequisite: `generateText()` в AiProvider

**Проблема:** текущий `AiProvider` интерфейс имеет только `streamChat()` — полный agentic loop (history, tools, callbacks, signal). Все non-chat LLM вызовы (`generateSummary`, `generateConcludeSummary` в `memory.ts`) обходят provider router и вызывают Gemini SDK напрямую — они Gemini-only.

Consolidation — первый non-chat use case, которому нужен **provider-agnostic one-shot generation с structured output**.

**Решение:** добавить `generateText()` метод в `AiProvider`:

```typescript
interface AiProvider {
    streamChat(opts: ProviderStreamOpts): Promise<StreamResult>;
    generateText?(opts: GenerateTextOpts): Promise<GenerateTextResult>;  // new, optional
}

interface GenerateTextOpts {
    model: string;
    systemPrompt?: string;
    text: string;
    /** JSON Schema for structured output. Each provider enforces natively:
     *  Gemini → responseMimeType + responseSchema
     *  Claude → tool_use + tool_choice forced */
    responseSchema?: Record<string, unknown>;
}

interface GenerateTextResult {
    text: string;
    tokenUsage?: TokenUsage;
    /** Parsed structured output (when responseSchema provided). */
    parsed?: unknown;
}
```

**Реализация per provider:**
- **Gemini:** `ai.models.generateContent()` + `responseMimeType: "application/json"` + `responseSchema` (когда schema задана)
- **Claude:** `anthropic.messages.create()` + synthetic tool definition из schema + `tool_choice: { type: "tool", name: "respond" }` (когда schema задана). Без schema — plain text response.

**Optional method** (`generateText?`) — обратная совместимость: существующие провайдеры не ломаются. Provider router проверяет наличие метода и выбрасывает понятную ошибку если провайдер не поддерживает one-shot.

**Будущие потребители** (помимо consolidation):
- L3 summarization (`generateSummary`) — сейчас Gemini-only, может стать provider-agnostic
- Topic segmentation (Stage 3 Memory roadmap)
- Embedding query generation

Это расширение core AI contract — Phase 2 consolidation CF зависит от этого prerequisite.

---

## Roadmap

- [x] Phase 0: `generateText()` in AiProvider — new method on core AI contract, implemented in Gemini + Claude factories, provider router dispatch
- [x] Phase 1: Protected flag — UI toggle + Firestore field + exclude from consolidation selection
- [x] Phase 2: Consolidation CF — Cloud Function `consolidateMemories`, prompt, `generateText()` call via provider router, JSON parsing
- [x] Phase 3: Consolidation UI — Modal (selection, model, intention, generate, preview/edit, save/cancel)

← YOU ARE HERE

### Market-ready vision

- Auto-suggest consolidation — система сама предлагает consolidation когда token cost превышает порог или обнаружены дубликаты
- Consolidation history — возможность откатить consolidation (архив старых memories, не hard delete)
- Scheduled consolidation — автоматический batch job (weekly/monthly) с approval step
- Smart grouping — LLM pre-groups memories по топикам, пользователь видит кластеры до consolidation

---

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | User-triggered, not automatic | Memories — пользовательская база знаний, автоматическое слияние без контроля опасно. User-triggered = review gate |
| 2 | Intention field | Consolidation — synthesis, не compression. Без направления LLM может потерять нюансы, которые важны пользователю |
| 3 | Protected flag | Вечные memories (user info, gut feelings) не должны мержиться. Проще один раз protect, чем каждый раз вручную exclude |
| 4 | LLM может вернуть N memories | Forcing into 1 memory теряет структуру. LLM лучше знает, какие топики стоит разделить |
| 5 | Before/After preview | Destructive операция (удаление старых memories) требует явного confirmation с визуальным diff |
| 6 | Atomic batch save | Промежуточное состояние (часть удалена, часть создана) недопустимо — Firestore batch |
| 7 | Model picker | Consolidation — аналитическая задача с варьирующимся trade-off cost/quality. Пользователь решает |
| 8 | Cloud Function, not client-side | API keys хранятся на сервере. CF консистентен с остальным проектом (aiChat, render). Отслеживаемый через Firebase CLI (logs, metrics) |
| 9 | Provider-agnostic via `generateText()` | Новый метод на `AiProvider` (Phase 0 prerequisite). One-shot, без streaming/tools/history. Provider router диспатчит к Gemini/Claude. Не привязан к Gemini JSON mode |
| 10 | Native structured output per provider, abstracted via `generateText()` | Consolidation output длинный (5 memories × 300 слов) — prompt-based JSON ненадёжен. Gemini: `responseMimeType` + `responseSchema`. Claude: tool_use + forced `tool_choice`. Prompt JSON-инструкции остаются как guidance, не как enforcement |
| 11 | Consistent memory section headers | Те же `## Decisions / Insights / Channel State / Action Items / Open Questions`, что в `CONCLUDE_SYSTEM_PROMPT`. Consolidated memories выглядят идентично обычным |
| 12 | Input format = crossConversationLayer format | `### "Title" (date)\n{content}` — LLM видит memories в том же формате, что и в чатах. Zero transformation overhead |
| 13 | CF = pure AI, Frontend = CRUD | CF stateless: принимает memories как текст, возвращает JSON. Не читает/пишет Firestore. Frontend владеет CRUD: `applyConsolidation()` — dedicated batch method (`writeBatch` с deletes + creates), не reuse single-write `createMemory`/`deleteMemory` |
| 14 | Not a chat tool | Consolidation — standalone CF, не часть agentic loop. Вызывается из UI, не из LLM. Не нуждается в `ToolDefinition` / `ToolContext` / `conversationId` |
| 15 | `source: 'consolidated'` on output memories | Отличает consolidated memories от chat/manual (UI badge/icon). Без `consolidatedFrom` — YAGNI: IDs исходных memories бесполезны после удаления (phantom references при повторной consolidation). Если откат понадобится — отдельная snapshot structure, не поле на doc |
| 16 | Content limits derived from `MODEL_REGISTRY.contextLimit` | Один source of truth: при обновлении модели провайдером → обновляем `contextLimit` → лимит автоматически пересчитывается. Не hardcoded constants, которые рассинхронизируются с реальными моделями |
| 17 | CF stateless — не читает/пишет Firestore | Memories приходят от фронтенда в request body. API keys — из Google Secret Manager (`defineSecret`). CF = pure function (text → text). Firestore CRUD = frontend responsibility |

---

## Implementation Notes

- **`ConversationMemory.source` type union** — расширить `'chat' | 'manual'` → `'chat' | 'manual' | 'consolidated'` в `src/core/types/chat/chat.ts`. Текущий тип не включает `'consolidated'` — typecheck не пройдёт без этого.
- **`vid://` / `ki://` link preservation** — консистентно с `saveKnowledge` и `saveMemory` tool definitions, которые инструктируют LLM использовать `[title](vid://ID)` формат. Consolidation prompt содержит аналогичную инструкцию + explicit "PRESERVE" directive, т.к. задача — synthesis существующего текста (а не генерация нового), и LLM может "переписать" ссылки при перефразировании.
- **`memoriesSnapshot` freeze** — consolidation меняет memories в Firestore, но активные чаты продолжают использовать замороженный `memoriesSnapshot` (snapshot на момент открытия разговора). Consolidated memories вступают в силу только в новых разговорах. Это корректное поведение — консистентно с design decision в [Memory System](./memory-system.md): "frozen snapshot prevents prompt cache invalidation".
- **Response contract priority** — `noChangesNeeded: true` → UI показывает "no overlap" message, `memories[]` игнорируется (даже если non-empty). `noChangesNeeded: false` + `memories.length === 0` → treat как error ("Model returned empty result"). Prompt инструктирует LLM держать эти поля консистентными, но CF валидирует на случай нарушения.
- **`kiRefs[]` не наследуются** — source memories (созданные через conclude flow) имеют `kiRefs: string[]` — ссылки на Knowledge Items. Consolidated memories создаются с пустым `kiRefs`. KI остаются intact (consolidation не трогает KI), но связь memory→KI теряется. Визуально: в MemoryCheckpoint у consolidated memory не будет секции "linked KI". Это acceptable — KI standalone, доступны через Knowledge Page и discovery flags.

## Open Questions

- **Consolidation history?** Стоит ли хранить "snapshot before consolidation" для возможности отката? Или достаточно Cancel в modal? Для MVP — достаточно Cancel; history можно добавить позже как market-ready feature.

---

## Technical Implementation

### Core AI contract: `generateText()`
- `GenerateTextOpts` / `GenerateTextResult` — `functions/src/services/ai/types.ts`
- `AiProviderWithGenerateText` — extended interface (router return type)
- Gemini impl: `functions/src/services/gemini/factory.ts` — `ai.models.generateContent()` + `toGeminiSchema()`
- Claude impl: `functions/src/services/claude/factory.ts` — `client.messages.create()` + tool_use pattern + `buildThinkingConfig()`
- Schema utils: `functions/src/services/gemini/schemaUtils.ts` — `toGeminiSchema()` (lowercase → uppercase recursive)
- Router: `functions/src/services/ai/providerRouter.ts` — `generateText()` dispatch

### Cloud Function
- `functions/src/chat/consolidation/consolidateMemories.ts` — `onCall`, 300s timeout, 512MiB, both secrets
- `functions/src/chat/consolidation/prompt.ts` — system prompt, schema, `buildUserPrompt()`, `validateConsolidationResult()`
- `functions/src/chat/consolidation/validation.ts` — `validateContentLimits()` (uses `CHARS_PER_TOKEN` from `memory.ts`)
- Cost: `computeIterationCost()` from `shared/models.ts`, returned as `costUsd` + `tokens`
- Logging: `[consolidate]` tags — Request (user, model, count), Response (tokens, cost, duration), Error

### Frontend
- `src/core/services/ai/aiProxyService.ts` — `callConsolidation()` (CF caller via `httpsCallable`)
- `src/core/services/ai/chatService.ts` — `applyConsolidation()` (atomic `writeBatch`), `toggleMemoryProtected()`
- `src/core/stores/chat/slices/settingsSlice.ts` — `toggleMemoryProtected` action
- `src/core/types/chat/chat.ts` — `ConversationMemory.protected`, `source: 'consolidated'`

### UI
- `src/features/Settings/components/ConsolidationModal.tsx` — multi-step modal (selection → loading → preview/edit → save)
- `src/features/Settings/components/AiAssistantSettings.tsx` — Consolidate button + Lock/Unlock toggle
- Design system atoms: `Button` (ghost/accent), `Checkbox`, `Dropdown` (portal-based model picker)
- Thinking selector: inline pills below model picker, resets on model change

---

## Related Features

- [Memory System](./memory-system.md) — L4 cross-conversation memory; consolidation работает поверх L4
- [Token Transparency](../cost/token-transparency.md) — `ContextBreakdown.memory` как триггер для consolidation
- [Knowledge Items](../../knowledge/knowledge-items.md) — KI не затрагиваются consolidation (point-in-time snapshots)
- [Multi-Provider Architecture](../infrastructure/multi-provider.md) — provider router; consolidation переиспользует ту же инфраструктуру
