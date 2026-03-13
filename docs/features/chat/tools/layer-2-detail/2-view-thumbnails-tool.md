# 🖼️ AI Tool: viewThumbnails — Feature Doc

## Текущее состояние

**Реализовано (v1.1).** AI может вызвать `viewThumbnails` в чате, чтобы визуально увидеть обложки видео (свои и чужие). Поддерживается поиск по `videoIds` и по `titles` (exact match fallback). Для Gemini: средний batch (< 15) загружается автоматически, большой batch (≥ 15) требует подтверждения пользователя. Для Claude: все обложки загружаются без подтверждения (approval gate отсутствует). Подробности в [Technical Implementation](#multi-provider-thumbnails).

---

## Что это — простыми словами

Представь, что ты разговариваешь с AI-ассистентом и говоришь: *«Посмотри на обложки топ-10 видео конкурентов и скажи, что общего»*. Раньше AI работал только с текстом — он видел названия, но не картинки. Теперь AI может реально **посмотреть** на обложки и описать то, что видит: цвета, шрифты, лица, эмоции, стиль.

---

## User flow (простыми словами)

### Стандартный случай (< 15 обложек)

1. Пользователь пишет: *«Сравни обложки моих последних 5 видео»*
2. Gemini понимает, что нужны картинки, и вызывает инструмент `viewThumbnails`
3. В UI появляется статус-пилюля с иконкой изображений (янтарного цвета): **Loading thumbnails...**
4. Сервер находит обложки и передаёт AI-модели
5. Пилюля меняется на **Viewed 5 videos** + превью сетка из 4 обложек
6. Gemini видит картинки и отвечает с визуальным анализом

### Большой batch (≥ 15 обложек)

1. Пользователь: *«Проанализируй обложки всех 30 рекомендованных видео»*
2. Handler возвращает 30 URL → middleware видит ≥ 15 → **блокирует** загрузку
3. Gemini получает системную заметку: *«30 thumbnails found, confirmation required»*
4. Gemini пишет пользователю: *«Нашёл 30 обложек. Загрузить все в контекст? Это займёт токены.»*
5. Под сообщением появляется **янтарный баннер** с кнопками **Load** / **Cancel**
6. Пользователь нажимает **Load** → тот же запрос уходит повторно с флагом `largePayloadApproved: true`
7. Теперь middleware пропускает — загрузка происходит, Gemini видит все 30 обложек

### Отмена

Пользователь нажимает **Cancel** → баннер закрывается, `pendingLargePayloadConfirmation: null`. Gemini уже получил системную заметку с количеством, поэтому может ответить без картинок: *«Отказались от загрузки. Могу проанализировать по названиям.»*

---

## Как работает под капотом — шаг за шагом

```
User message
     │
     ▼
[aiChat Cloud Function]
  ─ reads largePayloadApproved from HTTP body
  ─ passes to streamChat()
     │
     ▼
[streamChat — agentic loop]
  ─ Gemini sees videoIds in context → calls viewThumbnails(videoIds)
  ─ executeToolBatch() (shared, toolExecution.ts) → executeTool() → handleViewThumbnails()
     │
     ▼
[handleViewThumbnails]
  ─ resolveVideosByIds(): 3-step resolution (direct + publishedVideoId + trendChannels)
      users/{userId}/channels/{channelId}/videos/{id}                    ← own videos (direct + custom)
      users/{userId}/channels/{channelId}/cached_external_videos/{id}    ← external videos
      users/{userId}/channels/{channelId}/trendChannels/{ch}/videos/{id} ← competitor videos
  ─ priority: own > external_cache > trendChannels
  ─ caps at 50 IDs
  ─ returns { videos: [{videoId, title, thumbnailUrl, ...}], notFound: [], visualContextUrls: [...] }
     │
     ▼
[processImages callback — provider-specific]
  ─ Gemini: enhanceWithThumbnails() → gate check:
      count < 15  OR largePayloadApproved=true  →  fetchThumbnailParts() → Gemini Files API
      count >= 15 AND largePayloadApproved=false →  BLOCK, return blockedCount
  ─ Claude: extractVisualContextUrls() → inline URL image blocks (no gate)
     │
     ├─ [BLOCKED path — Gemini only]
     │    ─ cleanedResponse gets _systemNote (tells Gemini what happened)
     │    ─ onLargePayloadBlocked(count) fires
     │    ─ aiChat writes SSE: { type: "confirmLargePayload", count: N }
     │    ─ frontend chatStore sets pendingLargePayloadConfirmation = { count, text, attachments, convId, ... }
     │    ─ ConfirmLargePayloadBanner renders in UI
     │
     ├─ [APPROVED path — Gemini]
     │    ─ fetchThumbnailParts() → Gemini Files API upload (with 47h TTL cache)
     │    ─ returns Part[] with fileData references
     │    ─ imageParts appended to functionResponseParts alongside JSON result
     │    ─ Gemini sees text result + images in the same turn
     │
     └─ [Claude path — no gate]
          ─ extractVisualContextUrls() → raw URL strings
          ─ URLs inlined as { type: "image", source: { type: "url", url } } in tool_result
          ─ Claude sees text result + images directly (no Files API, no cache)
     │
     ▼
[Gemini — next iteration]
  ─ receives tool result (JSON) + image parts
  ─ generates visual analysis
     │
     ▼
[streamChat return]
  ─ updatedThumbnailCache propagated to next call (avoids re-upload)
  ─ toolCalls persisted to Firestore (uiResponse only — _systemNote stripped)
```

---

## Архитектура безопасности: approval gate

`allowLargePayload` намеренно **отсутствует** в JSON Schema инструмента. Gemini физически не может передать этот флаг в аргументах — он туда не попадёт даже если AI попытается.

Флаг `largePayloadApproved` читается **только** из HTTP-тела запроса (поле, которое пишет фронтенд после нажатия кнопки пользователем).

```
[Tool args from Gemini]   → НЕ содержит largePayloadApproved
[HTTP request body]       → largePayloadApproved: true/false (только отсюда)
```

---

## Thumbnail cache (47h TTL)

Gemini Files API хранит загруженные файлы 48 часов. После загрузки `fileUri` сохраняется в `ThumbnailCache` (in-memory на время вызова, передаётся через `updatedThumbnailCache` обратно в `aiChat`).

При повторном вызове `viewThumbnails` в той же беседе — уже загруженные файлы не перезагружаются.

```typescript
type ThumbnailCache = Record<string, {
    fileUri: string;
    mimeType: string;
    uploadedAt: number;  // ms timestamp — validity checked before reuse
}>;
```

---

## Параметры инструмента

| Параметр | Тип | Ограничения | Описание |
|---|---|---|---|
| `videoIds` | `string[]` | optional, max 50 | Список video ID для показа |
| `titles` | `string[]` | optional, max 20 | Fallback: exact titles для lookup когда ID неизвестен |

Необходим хотя бы один из параметров. `allowLargePayload` в схеме **отсутствует** намеренно.

---

## Что возвращает handler

```typescript
{
    videos: [{
        videoId: string;
        title: string;
        thumbnailUrl: string;  // mapped from Firestore field `thumbnail`
    }],
    notFound: string[];         // IDs not found in either collection
    notFoundTitles?: string[];  // titles that couldn't be resolved to videoIds
    visualContextUrls: string[]; // consumed by middleware, never reaches Gemini
}
```

**Важно:** `visualContextUrls` существует только внутри pipeline — middleware всегда его удаляет перед отправкой в Gemini.

---

## SSE events & frontend state machine

### Новое SSE-событие

```typescript
{ type: 'confirmLargePayload'; count: number }
```

Эмитируется из `aiChat.ts` → `aiProxyService.ts` → `chatStore.ts`:

```
SSE event received
       │
       ▼
chatStore.set({ pendingLargePayloadConfirmation: { count, text, attachments, convId, appContext, persistedContext } })
       │
       ▼
ChatMessageList renders <ConfirmLargePayloadBanner count={N} onConfirm={...} onDismiss={...} />
```

### Confirm flow (ключевой момент)

При нажатии **Load** `confirmLargePayload()` из store:
1. Читает `pendingLargePayloadConfirmation` (полный контекст оригинального запроса)
2. Очищает `pendingLargePayloadConfirmation: null`
3. Создаёт новый `AbortController` + `streamingNonce`
4. Вызывает `resumeSendFlow(..., largePayloadApproved: true)` напрямую
5. **Не** пишет новое сообщение пользователя в Firestore — история не засоряется

---

## UI компоненты

| Компонент | Файл | Назначение |
|---|---|---|
| `ConfirmLargePayloadBanner` | `features/Chat/components/ConfirmLargePayloadBanner.tsx` | Янтарный баннер с кнопками Load/Cancel |
| `ThumbnailGrid` | внутри `ToolCallSummary.tsx` | 4-колонная сетка превью обложек в expanded pill |
| Tool pill (amber) | `ToolCallSummary.tsx` | Янтарная пилюля `Images` иконка для viewThumbnails |

---

## Multi-provider thumbnails

**Gemini:** `viewThumbnails` handler возвращает URLs → `enhanceWithThumbnails()` проверяет approval gate (порог = 15) → при одобрении `fetchThumbnailParts()` загружает в Gemini Files API (47h TTL cache) → image Parts добавляются к tool result.

**Claude:** `extractVisualContextUrls()` извлекает URLs → инлайнятся как `{ type: "image", source: { type: "url", url } }` в `tool_result` content blocks. **Approval gate отсутствует** — все обложки загружаются без подтверждения и без лимита. Claude не использует Files API и thumbnail cache.

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **Proactive call** | Вызывает ли модель viewThumbnails сама после CTR-рекомендаций | "Почему у моего видео низкий CTR в suggested?" | — |
| 2 | **Explicit request (own)** | Прямой запрос на просмотр своих обложек | "Покажи обложки моих последних 5 видео" | — |
| 3 | **Competitor thumbnails** | Обложки из suggested traffic / trend videos | "Покажи обложки топ конкурентов из suggested traffic" | — |
| 4 | **Visual analysis quality** | Качество описания: цвета, шрифты, лица, стиль, паттерны | "Сравни мою обложку с обложками конкурентов" | — |
| 5 | **Approval gate (Gemini, ≥15)** | Срабатывает ли gate, понятно ли сообщение пользователю | "Покажи обложки всех 30 видео из suggested" | — |
| 6 | **Title lookup** | titles param когда videoId неизвестен | "Покажи обложку видео 'exact title'" | — |
| 7 | **Mixed batch** | Own + external видео в одном call | "Покажи обложку моего видео и 3 конкурентов рядом" | — |
| 8 | **Claude provider** | Работает ли без approval gate, inline URL images | (тот же промпт, другой provider) | — |
| 9 | **Post-analysis call** | Вызов после analyzeSuggestedTraffic — как в guidance написано | "Проведи полный анализ suggested traffic" (ожидаем viewThumbnails после) | — |
| 10 | **Not found handling** | notFound видео — не ломается ли анализ | Вызов с несуществующим videoId | — |

### Ключевые вопросы

1. **Proactive behavior** — Tool description говорит "call PROACTIVELY". Делает ли модель это без явного запроса?
2. **Visual analysis depth** — Описывает ли модель конкретные элементы (текст на обложке, эмоции лиц) или просто "яркая обложка"?
3. **Cross-tool chain** — После analyzeSuggestedTraffic guidance просит viewThumbnails. Работает ли цепочка?
4. **Approval gate UX** — Понятно ли пользователю, что нужно нажать Load? Не теряется ли контекст?
5. **Token cost** — Сколько токенов занимают image parts? При 10+ обложках — влияет ли на quality ответа?

### Проверено в бою

_Пока нет dedicated traces. В [analyzeSuggestedTraffic trace #1](../layer-3-analysis/2-analyze-suggested-traffic-tool.md) модель НЕ вызвала viewThumbnails, хотя дала thumbnail-рекомендации — отмечено как FAIL (partial). Guidance уточнён._

### Ещё не проверено в бою

| Сценарий | Почему важно |
|----------|-------------|
| **Proactive viewThumbnails** | Ключевая фича: модель должна САМА смотреть обложки перед рекомендациями |
| **Approval gate flow** | Баннер + Load/Cancel — end-to-end UX при ≥15 обложках |
| **Provider comparison** | Gemini (Files API + gate) vs Claude (inline URLs, no gate) — оба работают? |
| **Visual analysis quality** | Насколько полезен анализ? Или модель повторяет "professional thumbnail" штампы? |

---

## Расположение файлов

```
functions/src/
  services/
    ai/
      toolExecution.ts                             ← shared batch executor + processImages callback
    tools/
      handlers/
        viewThumbnails.ts                          ← Firestore lookup via resolveVideosByIds
        __tests__/
          viewThumbnails.handler.test.ts           ← 12 tests
          getMultipleVideoDetails.bugfix.test.ts   ← 2 tests (thumbnail field bugfix)
    gemini/
      thumbnailMiddleware.ts                       ← approval gate (Gemini only)
      thumbnails.ts                                ← fetchThumbnailParts, Gemini Files API upload, 47h TTL cache
      context.ts                                   ← GeminiProviderContext (largePayloadApproved, onLargePayloadBlocked)
      __tests__/
        thumbnailMiddleware.test.ts                ← 6 tests
    claude/
      streamChat.ts                                ← extractVisualContextUrls, inline URL image blocks

src/
  core/
    types/
      sseEvents.ts                                 ← SSEConfirmLargePayloadEvent
    services/
      ai/aiService.ts                              ← largePayloadApproved + onConfirmLargePayload opts
      ai/aiProxyService.ts                         ← SSE handler for confirmLargePayload
    stores/
      chatStore.ts                                 ← pendingLargePayloadConfirmation state + confirmLargePayload action
  features/
    Chat/
      components/
        ConfirmLargePayloadBanner.tsx              ← confirmation UI
        ToolCallSummary.tsx                        ← ThumbnailGrid + amber pill
      utils/
        toolCallGrouping.ts                        ← viewThumbnails grouping + isThumbnailTool
      ChatMessageList.tsx                          ← banner integration
```

---

## Связанные фичи

- [Agentic Architecture](../../infrastructure/agentic-architecture.md) — общая архитектура agentic loop
- [analyzeSuggestedTraffic](../layer-3-analysis/2-analyze-suggested-traffic-tool.md) — другой AI инструмент с визуальным UI

---

## ← YOU ARE HERE → v1.1: title lookup + tool description updates

## Roadmap

### Stage 2 — Thumbnail cache persistence
**Бизнес-цель:** не перезагружать одни и те же обложки между сессиями.

- [ ] Persist `ThumbnailCache` в Firestore (per user/channel)
- [ ] TTL cleanup job для просроченных Gemini file URIs

### Stage 3 — Batch competitor analysis
**Бизнес-цель:** AI автоматически просматривает обложки конкурентов из suggested traffic и даёт рекомендации по дизайну.

- [ ] Интеграция с `analyzeSuggestedTraffic` — передавать topSources videoIds в viewThumbnails
- [ ] Автоматический approval для trusted flows (не через UI)

### Stage 4 — Market-ready
**Бизнес-цель:** визуальный AI-анализ как отдельная фича в продукте.

- [ ] Cost tracking (Gemini Files API calls per user)
- [ ] Rate limiting для thumbnail uploads
- [ ] Кеш по каналу + автоочистка
