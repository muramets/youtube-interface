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
3. Handler ищет видео в `videos/` → `cached_external_videos/`
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

- [Telescope Pattern Overview](./README.md) — utility layer
- Все analysis tools используют `mentionVideo` для reference видео в ответах

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/mentionVideo.ts` | Handler: dual-collection lookup |
| `functions/src/services/tools/definitions.ts` | Tool declaration |
