# 🔀 Multi-Provider Architecture — Feature Doc

## Простыми словами

Раньше чат работал только с **одним поставщиком** — Gemini. Весь код (стриминг, retry, tools, types) был привязан к Gemini API напрямую.

Теперь чат работает через **абстрактный роутер**: модель выбирается в UI → роутер определяет провайдера (Gemini или Claude) → вызывает нужный движок. Каждый провайдер **владеет своим agentic loop**, но они делят общие утилиты (retry, tool execution, memory).

---

## Текущее состояние ← YOU ARE HERE

**Провайдеры:** Gemini (4 модели) + Anthropic Claude (3 модели) через единый provider router.

**Что работает:**
- Provider Router — lazy initialization, model → provider маппинг из `MODEL_REGISTRY`
- Claude streaming (SSE) — текст, thinking, tool calls, retry
- Claude agentic loop — до 10 итераций, `executeToolBatch()`, 90s inactivity timeout
- Thinking per-model — Gemini: `thinkingLevel` (enum) или `thinkingBudget` (tokens); Claude: `budget_tokens`
- UI — dropdown с группировкой по провайдеру (GEMINI / CLAUDE секции), thinking level адаптируется под модель
- **Provider-agnostic attachments** — все модели получают file attachments через `ProviderStreamOpts.attachments`. Gemini использует pre-uploaded refs (fast path) или server-side fallback upload. Claude принимает images по URL + PDF как document blocks.
- **UI attachment filtering** — `accept` attribute и Send blocking адаптируются per-model из `MODEL_REGISTRY.attachmentSupport`
- 239 backend тестов, 21 contract test для Claude streamChat
- **Token Transparency** — оба провайдера пишут `normalizedUsage` (provider-agnostic `NormalizedTokenUsage`) на каждое model message. Включает per-iteration breakdown, thinking tokens, cost в USD. Подробности: `docs/features/chat/token-transparency.md`
- **Utility Model Strategy** — вспомогательные задачи всегда через Gemini (не зависят от user model):
  - Title generation → `gemini-2.5-flash` (дёшево, 5 слов)
  - Summarization (Layer 3) → `gemini-2.5-flash` (сжатие текста)
  - Memorization (Layer 4) → `resolveUtilityModel()` (Gemini user → их модель, Claude user → fallback `DEFAULT_MODEL_ID` = Pro)
- Thinking brain icon скрыта для моделей без thinking (Haiku — только `off`)

**Секрет:** `ANTHROPIC_API_KEY` в Google Secret Manager. `GEMINI_API_KEY` обязателен всегда (utility tasks + Gemini provider).

---

## Архитектура

```
User selects model in UI
         │
         ▼
┌─────────────────────────┐
│  aiChat.ts (SSE endpoint) │
│  - auth, validation      │
│  - buildMemory()         │
│  - createProviderRouter()│
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Provider Router         │
│  model → provider lookup │
│  lazy factory init       │
└─────┬───────────┬───────┘
      ▼           ▼
┌──────────┐ ┌──────────┐
│  Gemini  │ │  Claude  │
│ Provider │ │ Provider │
│          │ │          │
│ - stream │ │ - stream │
│ - tools  │ │ - tools  │
│ - images │ │ - thinking│
│ - retry  │ │ - retry  │
└──────────┘ └──────────┘
      │           │
      ▼           ▼
┌─────────────────────────┐
│  Shared Utilities        │
│  - executeToolBatch()    │
│  - withStreamRetry()     │
│  - formatContextLabel()  │
│  - TOOL_DECLARATIONS     │
└─────────────────────────┘
```

### Anti-Corruption Layer

| Граница | Имя поля | Пояснение |
|---------|----------|-----------|
| HTTP (AiChatRequest) | `fileRef` | Provider-agnostic — может быть любой URI |
| Firestore (ChatAttachmentData) | `geminiFileUri` | Gemini-internal — хранит URI загруженного в Gemini Files API |
| Gemini Provider Context | `currentMessageAttachments` | `{ geminiFileUri, mimeType }[]` — pre-uploaded файлы текущего сообщения |

---

## Модели

| Модель | Провайдер | Context | Thinking | Pricing (input/output per 1M) |
|--------|-----------|---------|----------|-------------------------------|
| Gemini 3.1 Pro | gemini | 1M | level: low/medium/high | $2 / $12 |
| Gemini 3 Flash | gemini | 1M | level: minimal/low/medium/high | $0.50 / $3 |
| Gemini 2.5 Pro | gemini | 1M | budget: auto/1K/8K/24K | $1.25 / $10 |
| Gemini 2.5 Flash | gemini | 1M | budget: off/auto/1K/8K/24K | $0.30 / $2.50 |
| Claude Opus 4.6 | anthropic | 200K | adaptive: off/low/medium/high/max | $5 / $25 |
| Claude Sonnet 4.6 | anthropic | 200K | adaptive: off/low/medium/high/max | $3 / $15 |
| Claude Haiku 4.5 | anthropic | 200K | only off | $1 / $5 |

---

## Структура файлов

### Provider Abstraction (`functions/src/services/ai/`)
```
ai/
├── types.ts              # AiProvider, ProviderStreamOpts, StreamCallbacks, StreamResult
├── providerRouter.ts     # createProviderRouter() — model → provider dispatch
├── retry.ts              # withStreamRetry() — shared retry logic
├── toolExecution.ts      # executeToolBatch() — shared tool dispatch
└── __tests__/
    ├── providerRouter.test.ts  # 13 tests
    ├── retry.test.ts           # 15 tests
    └── toolExecution.test.ts   # 16 tests
```

### Gemini Provider (`functions/src/services/gemini/`)
```
gemini/
├── client.ts                # Singleton GenAI client
├── streamChat.ts            # Gemini agentic loop (streaming + tools + images)
├── factory.ts               # geminiFactory: ProviderFactory
├── context.ts               # GeminiProviderContext type + geminiContext() helper
├── toolAdapter.ts           # toFunctionDeclarations() — ToolDefinition[] → Gemini format
├── thumbnailMiddleware.ts   # enhanceWithThumbnails() — approval gate (Gemini only)
├── thumbnails.ts            # fetchThumbnailParts() — Gemini Files API upload, 47h TTL cache
├── fileUpload.ts            # reuploadFromStorage() — server-side fallback upload
├── titleGeneration.ts       # generateTitle() — conversation title via utility model
├── index.ts                 # Barrel exports
└── __tests__/
    ├── streamChat.contract.test.ts  # Contract tests
    ├── streamChat.retry.test.ts     # Retry tests
    └── thumbnailMiddleware.test.ts  # Thumbnail tests
```

### Claude Provider (`functions/src/services/claude/`)
```
claude/
├── client.ts          # Singleton Anthropic SDK client
├── streamChat.ts      # Claude agentic loop (streaming + tools + thinking)
├── factory.ts         # claudeFactory: ProviderFactory
└── __tests__/
    └── streamChat.test.ts  # 21 contract tests (5 suites)
```

### Shared (`functions/src/services/`)
```
services/
├── memory.ts          # buildMemory() — summarization (always Gemini Flash)
└── tools/
    ├── definitions.ts # TOOL_DECLARATIONS — provider-agnostic
    ├── executor.ts    # executeTool() dispatcher
    ├── types.ts       # ToolContext, ToolResult
    └── handlers/      # Tool implementations
```

---

## Roadmap

### Стадия 1 — Provider Abstraction Layer ✅
Абстракция типов и утилит, вынос из Gemini-specific кода.
- [x] `AiProvider` interface + `ProviderStreamOpts` + `StreamCallbacks` + `StreamResult`
- [x] `createProviderRouter()` — lazy init, model prefix matching
- [x] `withStreamRetry()` — extracted from Gemini streamChat
- [x] `executeToolBatch()` — extracted from Gemini streamChat
- [x] `thumbnailMiddleware` → provider-agnostic `imageUrls[]` (вместо Gemini `Part[]`)
- [x] `geminiFactory` + `GeminiProviderContext` + `geminiContext()`
- [x] `toFunctionDeclarations()` adapter (ToolDefinition → Gemini format)
- [x] `aiChat.ts` rewired to use provider router
- [x] 44+ characterization tests (router, retry, toolExecution)

### Стадия 2 — Claude Provider ✅
Полная реализация Claude провайдера с agentic loop.
- [x] `claude/client.ts` — Anthropic SDK singleton
- [x] `claude/streamChat.ts` — streaming, thinking, tool calls, retry
- [x] `claude/factory.ts` — `ProviderFactory` implementation
- [x] `buildHistory()` — HistoryMessage → Claude MessageParam (role mapping, images, context labels)
- [x] `buildThinkingConfig()` — thinkingOptionId → Claude thinking param
- [x] `toClaudeTools()` — ToolDefinition → Claude Tool format
- [x] Thinking leak protection (фильтрация `<think>` из text blocks)
- [x] 90s inactivity timeout, MAX_AGENTIC_ITERATIONS=10
- [x] 21 contract tests (5 suites: happy path, tools, thinking, retry, errors)

### Стадия 3 — Frontend ✅
UI поддержка мульти-провайдера.
- [x] Model dropdown: группировка GEMINI / CLAUDE с non-interactive headers
- [x] Thinking dropdown: адаптируется под модель из `MODEL_REGISTRY`
- [x] ProjectSettings: та же группировка + "Use global default"
- [x] Compact label: префикс провайдера strip из кнопки ("Sonnet 4.6" вместо "Claude Sonnet 4.6")

### Стадия 4 — Provider-Agnostic Attachments ✅
Все провайдеры получают file attachments, UI фильтрует допустимые типы per-model.
- [x] `AttachmentSupport` interface + per-model capability metadata в `MODEL_REGISTRY`
- [x] `getAcceptedMimeTypes()` / `isAllowedMimeTypeForModel()` — shared helpers
- [x] `fileRef` optional — Claude skips Gemini Files API upload
- [x] Send flow передаёт полные attachment данные (type, url, name, mimeType, fileRef?)
- [x] `aiChat.ts` маппит attachments → generic `ProviderStreamOpts.attachments`
- [x] `currentMessageGeminiRefs` rename + server-side fallback upload в `geminiFactory`
- [x] `toClaudeAttachmentBlock()` — image → image block, PDF → document block, other → text fallback
- [x] Conditional Gemini upload в `useFileAttachments` (skip для Anthropic models)
- [x] Dynamic `accept` attribute + Send blocking при несовместимых файлах
- [x] Inline warning "Some files are not supported by {model}"

### Стадия 5 — Production Hardening
- [ ] Provider-specific rate limiting и cost tracking
- [ ] Claude-specific error codes в `parseSSEEvent`
- [ ] A/B testing framework (model comparison per-conversation)
- [ ] Provider health dashboard (latency, error rates, cost per model)

---

## Связанные фичи
- [AI Chat — README](./README.md) — общий обзор чат-системы
- [Agentic Architecture](./agentic-architecture.md) — agentic loop, tools, thinking
- [Chat Resilience](./chat-resilience.md) — retry, progressive status
- [Context & Tokens](./context-token-optimization.md) — memory, summarization, token budget
