# Context Bridges — Автоматический контекст для AI Chat

## Текущее состояние

**Реализовано (Stage 2 Chat).** 4 моста автоматически передают выделенные элементы со страниц приложения в AI-чат. Пользователь выделяет видео на любой странице — ассистент сразу видит, с чем он работает.

Мосты работают **фоново** (через `useEffect`), без участия пользователя. Это отличает их от **Floating Bar** действий (Add to Canvas, Add to Playlist и пр.), которые требуют явного клика — те описаны в соответствующих feature docs.

---

## Что это и зачем

Представь: ты выделил 5 видео в плейлисте и открыл чат. Без мостов тебе пришлось бы вручную объяснять ассистенту, какие видео ты хочешь обсудить. С мостами — ассистент **уже знает**, что ты выделил, и может сразу сравнивать их, анализировать CTR, предлагать идеи.

Мосты — это "невидимые провода" между страницами приложения и AI-чатом. Каждый мост наблюдает за выделением на своей странице и автоматически пробрасывает данные в общее хранилище, которое Chat читает.

---

## User flow

1. Пользователь выделяет видео на странице (Home, Playlists, Traffic, Canvas, Trends)
2. Мост автоматически копирует метаданные выделенных видео в хранилище контекста
3. В ChatInput появляется accordion с chips — видно, что прикреплено
4. Пользователь пишет сообщение — контекст уходит в system prompt вместе с вопросом
5. AI отвечает, зная о выделенных видео

### Sticky behavior (липкое поведение)

Снятие выделения **НЕ убирает** контекст из чата. Это сделано намеренно: пользователь может выделить видео на одной странице, перейти на другую, выделить ещё — и всё накопится в чате. Удаление контекста — только через:
- Кнопку **X** на отдельном chip в ChatInput
- Кнопку **Clear All** (X на заголовке accordion)
- Отправку сообщения (context consumed)

### Pause / Resume (глобальная пауза)

Кнопка **Link/Unlink** в ChatInput:
- **Link** (зелёная) — мосты активны, выделение синхронизируется
- **Unlink** (янтарная) — мосты на паузе, выделение НЕ попадает в чат

Пауза глобальная — останавливает ВСЕ 4 моста одновременно. Полезно, когда хочешь выделять видео для других действий (Add to Canvas, Export), не засоряя чат.

---

## 4 моста

| Мост | Страницы-источники | Что передаёт | Подробнее |
|------|-------------------|-------------|-----------|
| Selection Bridge | Home, Playlists, PlaylistDetail | Свои видео (drafts, published) | [bridges.md](./bridges.md#selection-bridge) |
| Traffic Bridge | Video Details > Traffic tab | Source video + suggested videos + metrics | [bridges.md](./bridges.md#traffic-bridge) |
| Canvas Bridge | Canvas Overlay | Все типы нод: video, traffic-source, sticky-note, image, frame | [bridges.md](./bridges.md#canvas-bridge) |
| Trends Bridge | Trends page | Competitor videos | [bridges.md](./bridges.md#trends-bridge) |

---

## Что происходит после моста

Мост — это только первый шаг. Полный путь от выделения до AI:

```
Selection на странице
    |
    v
Context Bridge (useEffect) --> appContextStore (4 слота)
    |
    v
ChatInput UI (ContextAccordion — chips, badges, remove)
    |
    v
User sends message --> prepareContext()
    |
    v
enrichContextWithDeltas() -- добавляет рост просмотров (24h/7d/30d)
    |
    v
persistentContextLayer -- форматирует в Markdown для system prompt
    |
    v
AI модель (Gemini / Claude) читает контекст и отвечает
```

Подробнее об enrichment pipeline: [enrichment-pipeline.md](./enrichment-pipeline.md)

---

## Связь с другими механизмами

**Context Bridges vs Floating Bar actions:**
Floating Bars (тулбар, появляющийся при выделении) предлагают **ручные действия**: Add to Canvas, Add to Playlist, Add to Home, Export CSV, Trash. Эти действия пишут напрямую в целевые stores (canvasStore, VideoService и пр.) и **не проходят** через appContextStore. Context Bridges и Floating Bars — два параллельных потребителя одного и того же selection state.

---

## Связанные docs

- [Architecture (slot system, store, types)](./architecture.md)
- [4 моста в деталях](./bridges.md)
- [Enrichment Pipeline](./enrichment-pipeline.md)
- [Canvas Feature](../../../canvas/README.md) — визуальная доска, типы нод, добавление видео на Canvas
- [AI Chat README](../../README.md) — общая архитектура чата
- [Context & Token Optimization](../token-optimization.md) — compact L1, on-demand details
- [Memory System](../memory-system.md) — 4 слоя памяти (L1-L4)
