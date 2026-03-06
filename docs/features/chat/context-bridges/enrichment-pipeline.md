# Context Bridges — Enrichment Pipeline

## Обзор

Между моментом, когда мост записывает данные в `appContextStore`, и моментом, когда AI модель получает system prompt, контекст проходит через **enrichment pipeline** — цепочку обогащения и форматирования.

```
appContextStore (raw items)
       |
       v
prepareContext()                  -- orchestrator
       |
       v
enrichContextWithDeltas()         -- добавляет delta views (24h/7d/30d)
       |
       v
mergeContextItems()               -- merge с existing persisted context
       |
       v
persist to Firestore              -- fire-and-forget (conversation doc)
       |
       v
buildPersistentContextLayer()     -- L1 Memory Layer: format as Markdown
       |
       v
System Prompt --> AI Model
```

---

## Шаг 1: prepareContext()

Оркестратор, вызывается из `chatStore.sendMessage()`. Принимает:
- `rawItems` — snapshot из `appContextStore` (результат `selectAllItems`)
- `userId`, `channelId`, `convId` — идентификаторы
- `existingPersisted` — ранее сохранённый контекст беседы

Возвращает:
- `appContext` — enriched items для текущего сообщения
- `persistedContext` — merged accumulated контекст беседы (для L1 prompt)

### Merge с persistent context

Каждое сообщение может нести новый контекст. `mergeContextItems()` объединяет его с ранее накопленным, пропуская дубликаты по identity key. Результат сохраняется в Firestore conversation doc (fire-and-forget) и используется в system prompt.

Это даёт "нарастающую память": в первом сообщении пользователь прикрепил 3 видео, во втором — ещё 2. AI видит все 5 в каждом последующем сообщении.

---

## Шаг 2: enrichContextWithDeltas()

Middleware, добавляющий данные о **росте просмотров** к `VideoCardContext` items.

### Что делает

1. Собирает `videoId` из всех video-card items
2. Извлекает `channelIdHints` из `VideoCardContext` items — set уникальных `channelId`, которые позволяют сузить lookup до нужных каналов вместо перебора всех
3. Читает `trendStore.channels` и `channelStore.currentChannel` (императивно, вне React)
4. Делегирует вычисление в `computeVideoDeltas()`, который использует `calculateViewDeltas()` из `shared/viewDeltas.ts` — единый алгоритм (SSOT) для фронтенда и бэкенда
5. Патчит items: `delta24h`, `delta7d`, `delta30d`

### Зачем

AI видит не только "150K views", а "150K views, +1.2K за 24h, +5.3K за 7d" — может определить, растёт ли видео, стагнирует или падает. Без дельт AI пришлось бы угадывать динамику.

### channelIdHints (оптимизация)

Каждый `VideoCardContext` item содержит `channelId` (trend channel). `enrichContextWithDeltas` собирает их в `Set<string>` и передаёт как `channelIdHints` в `computeVideoDeltas()`. Это позволяет пропустить каналы, видео которых нет в текущем контексте, вместо перебора всех trend channels — значительное ускорение при большом количестве отслеживаемых каналов.

### Данные для вычисления

Дельты берутся из **trend snapshots** — периодических снимков статистики каналов. Алгоритм `calculateViewDeltas()` из `shared/viewDeltas.ts` ищет ближайший snapshot к целевому timestamp (24h/7d/30d назад) и вычисляет разницу. Если для видео нет snapshot данных — item возвращается без delta полей (graceful degradation).

---

## Шаг 3: buildPersistentContextLayer() (L1 Memory)

Форматирует enriched `AppContextItem[]` в Markdown-секции для system prompt.

### Формат по типам

**VideoCardContext** (слоты playlist, trends):
```
## Your Videos — Attached by User

- Your Video: "My Title" [id: abc123] -- Views: 150K | 24h: +1.2K / 7d: +5.3K | Published: 2024-01-15 | Duration: 12:34
- Competitor: "Their Title" [id: xyz789] (Channel: SomeChannel) -- Views: 500K | Published: 2024-02-01
```

Группировка по ownership: сначала drafts, потом published, потом competitors. Description и tags **не включаются** — они доступны через tool `getMultipleVideoDetails` on-demand (экономия ~75% токенов).

**SuggestedTrafficContext** (слот traffic):
```
## Suggested Traffic Analysis

**Data exported:** January 15, 2024
**User's label for this export:** "Before title change"

### Source Video (user's video that YouTube suggests alongside)
- "My Video" [id: abc123] -- Views: 100K | Published: 2024-01-01

### Selected Suggested Videos
- Suggested: "Their Video" [id: def456] (SomeChannel) -- Imp: 5,000 | CTR: 4.2% | Views: 210 | AvgDur: 03:45 | WatchTime: 2.1h

### Traffic Discrepancy (Long Tail)
YouTube reports higher totals than the sum of individual sources...
- Report Total: 50K impressions / 2.1K views
- Top Videos Sum: 35K impressions / 1.5K views
- Long Tail (hidden): +15K (30%) / +600 (29%)
```

**CanvasSelectionContext** (слот canvas):
```
## Canvas Board — Selected Nodes

### Videos
- Your Video: "Title" [id: abc123] -- Views: 100K

### Traffic Source Cards
#### Traffic Source 1: "Their Video"
- Impressions: 5,000
- CTR: 4.2%
...

### User's Notes
#### Note 1
Some user text here

### Snapshot: "My Video" -- "Before title change"
- Selected: 12 traffic sources from this snapshot
```

### Compact format (design decision)

System prompt содержит только **title + ключевые метрики** для каждого видео. Это сознательный trade-off:
- 5 видео ~ 500 токенов (вместо ~2K с full context)
- 150 видео ~ 10K токенов (вместо ~42K)
- AI вызывает `getMultipleVideoDetails` tool когда нужны description/tags

Подробнее: [Context & Token Optimization](../context-token-optimization.md)

---

## Technical Implementation

**Orchestrator:** `src/core/ai/pipeline/prepareContext.ts`
**Delta enrichment:** `src/core/ai/pipeline/enrichContextWithDeltas.ts`
**Delta algorithm (SSOT):** `shared/viewDeltas.ts` (`calculateViewDeltas`, `VideoDeltaStats`, `DELTA_SNAPSHOT_DAYS`)
**Delta I/O wrapper:** `src/core/utils/computeVideoDeltas.ts`
**L1 formatting:** `src/core/ai/layers/persistentContextLayer.ts`
**Merge logic:** `src/core/types/appContext.ts` (`mergeContextItems`)
**Prompt templates:** `src/core/config/prompts.ts` (VIDEO_CONTEXT_PREAMBLE, TRAFFIC_CONTEXT_HEADER, CANVAS_CONTEXT_HEADER, etc.)

---

## Связанные docs

- [README (обзор, user flow)](./README.md)
- [Architecture (slot system, types)](./architecture.md)
- [4 моста в деталях](./bridges.md)
- [Context & Token Optimization](../context-token-optimization.md)
