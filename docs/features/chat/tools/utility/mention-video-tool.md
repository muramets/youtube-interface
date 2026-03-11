# AI Tool: mentionVideo — Feature Doc

## Текущее состояние

**Реализовано.** Utility-тул. LLM вызывает `mentionVideo(videoId)` при любом упоминании видео в ответе → UI рендерит интерактивный badge, по клику на который пользователь переходит к видео.

---

## Что это

Когда AI упоминает видео в тексте, вместо plain text (*"видео #3"*) он вызывает `mentionVideo` — UI показывает кликабельный badge с заголовком и обложкой. Это делает ответы AI интерактивными и навигируемыми.

---

## User flow

1. LLM анализирует данные и хочет упомянуть конкретное видео
2. Вызывает `mentionVideo(videoId)`
3. Handler ищет видео через `resolveVideosByIds` (direct + publishedVideoId reverse + trendChannels lookup)
4. Возвращает метаданные для badge
5. LLM пишет в тексте: `[Video Title](mention://videoId)`
6. UI рендерит интерактивный badge

---

## Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `videoId` | string (required) | Exact video ID из контекста или предыдущих tool results |

---

## Что возвращает

```typescript
{
    found: boolean,
    videoId: string,
    title: string,
    ownership: string,
    channelTitle?: string,
    thumbnailUrl: string,
}
```

Если видео не найдено: `{ found: false, videoId, error: "Video not found in database" }`.

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md) — utility layer
- Все analysis tools используют `mentionVideo` для reference видео в ответах

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/mentionVideo.ts` | Handler: video resolution via resolveVideosByIds |
| `functions/src/services/tools/utils/resolveVideos.ts` | Shared 3-step video resolution (direct + publishedVideoId + trendChannels) |
| `functions/src/services/tools/definitions.ts` | Tool declaration |
| `src/features/Chat/ChatMessageList.tsx` | Frontend: mention URL sanitization + badge rendering |

---

## Battle Testing

### Найденные и исправленные баги

**Ownership bug: whitelist вместо blacklist** (исправлен 2026-03-11)
- **Симптом:** `mentionVideo` вернул `ownership: "own-published"` для видео конкурента (Ophelia Wilde — `EvPEXA2iH4g`). В том же trace другое видео того же канала правильно помечено `"competitor"`
- **Причина:** ownership определялся по `entry.source` (коллекции Firestore), а не по данным документа. Видео из `cached_external_videos/` или из `videos/` (конкурент добавленный в плейлист/home) получали fallback `"own-published"`. Blacklist-логика: `if trend_channel → competitor, else → own`
- **Фикс:** ownership теперь определяется по данным документа (whitelist-логика), зеркалируя frontend `videoAdapters.ts`:
  - `isCustom: true` + `publishedVideoId` → `"own-published"`
  - `isCustom: true` без `publishedVideoId` → `"own-draft"`
  - `channelTitle === ctx.channelName` → `"own-published"` (own YouTube video добавленное по ссылке)
  - Всё остальное → `"competitor"` / `"external"`
- **Scope:** `mentionVideo.ts`, `getMultipleVideoDetails.ts` (formatVideoData), `ToolContext` (+`channelName`), `verifyChannelAccess` (возвращает channel name из уже читаемого doc)
- **Урок:** whitelist > blacklist для ownership. Спрашивай "это точно моё?" (один конкретный признак), а не "это чужое?" (пытаясь перечислить все чужие источники)

**Mention URL sanitization: LLM malformed URLs** (исправлен 2026-03-11)
- **Симптом:** Sonnet сгенерировал `[a playlist for early mornings](mention:// -1qX9PdD4io)` — пробел после `//`. В чате mention-pill не рендерился, отображался как plain text
- **Причина:** CommonMark парсер не создаёт `<a>` тег из URL с пробелом — `href` невалиден. `a` component override в ReactMarkdown никогда не вызывается → mention regex не срабатывает
- **Фикс (frontend, `ChatMessageList.tsx`):** два pre-process regex **до** передачи в ReactMarkdown:
  - `MENTION_URL_FIX_RE`: `/\]\(mention:\/{2,}\s+/g` → убирает пробелы и лишние `/` в mention URLs
  - `MENTION_SPACE_RE`: `/(\S)\[([^\]]+)\]\(mention:\/\//g` → вставляет пробел перед `[`, когда LLM склеивает текст с mention link ("растёт[title]" → "растёт [title]")
- **Принцип:** двухуровневая защита от LLM output: pre-process (fix URL до парсера) + post-process (extract videoId после парсера, существующий `MENTION_RE`)
- **Урок:** LLM генерируют "почти правильный" markdown. Стандартные парсеры строги к формату URL. Для любого custom URI scheme (`mention://`, `app://`) нужен sanitization layer между LLM output и markdown parser
