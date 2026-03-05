# AI Tool: browseChannelVideos — Feature Doc

## Текущее состояние

**Реализовано.** Telescope Pattern Layer 1 — fetch. Получает список видео канала через YouTube API, использует 2-level smart caching (Firestore → YouTube API), кэширует в `cached_external_videos/`. Для своего канала показывает `ownChannelSync` (inApp vs onYouTube delta).

---

## Что это

После `getChannelOverview` (resolve + quota gate), LLM вызывает `browseChannelVideos` для получения списка видео. Handler оптимизирует квоту: сначала проверяет кэш (`videos/` + `cached_external_videos/`), затем обращается к YouTube API только за действительно отсутствующими видео.

---

## User flow

1. LLM уже вызвала `getChannelOverview` → получила `uploadsPlaylistId`
2. Пользователь одобрил квоту
3. LLM вызывает `browseChannelVideos(uploadsPlaylistId)`
4. Handler: кэш → YouTube API (только missing) → кэширование → ответ
5. LLM получает хронологический список и решает, куда копать дальше

---

## Параметры

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `uploadsPlaylistId` | string | — | Required. Из ответа `getChannelOverview` |
| `channelId` | string | — | Optional. Для trend cache optimization |
| `publishedAfter` | string (ISO date) | — | Фильтр по дате (экономия output, не API) |

---

## Что возвращает

```typescript
{
    videos: [{ videoId, title, publishedAt, viewCount, thumbnailUrl }],
    totalVideosOnYouTube: number,
    alreadyCached: number,
    fetchedFromYouTube: number,
    quotaUsed: number,
    ownChannelSync?: {         // only when browsing own channel
        inApp: number,
        onYouTube: number,
        notInApp: number,
    },
}
```

Side effect: все fetched видео кэшируются в `cached_external_videos/`.

---

## Smart Caching (2-level)

1. **`videos/` + `cached_external_videos/`** — parallel batch reads (0 API cost)
2. **YouTube API** — только для truly missing videoIds

Для каналов <100 видео → загружаем всё за ~2 unit'а.

---

## Own Channel Sync

Когда пользователь просматривает свой канал, ответ включает `ownChannelSync` — сколько видео в приложении vs на YouTube. LLM акцентирует внимание на разнице.

---

## Связанные фичи

- [Telescope Pattern Overview](./README.md)
- [getChannelOverview](./get-channel-overview-tool.md) — prerequisite (quota gate)
- [getMultipleVideoDetails](./get-multiple-video-details-tool.md) — следующий шаг (full metadata)

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/browseChannelVideos.ts` | Handler: playlist fetch, 2-level cache, own channel sync |
| `functions/src/services/tools/definitions.ts` | Tool declaration |
| `functions/src/services/youtube.ts` | `getPlaylistVideos()`, `getVideoDetails()` |

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/browseChannelVideos.test.ts` | — |

---

## Roadmap

### `publishedAfter` early stop при пагинации

`publishedAfter` фильтр применяется post-fetch (после загрузки всех страниц из YouTube API). Для каналов с <200 видео (1-4 страницы) это не проблема. Для каналов с 1000+ видео — тратит лишнюю квоту.

**Задача:** передать `publishedAfter` в `YouTubeService.getPlaylistVideos()` и остановить пагинацию, когда `publishedAt` видео становится старше порога. YouTube API возвращает видео в обратном хронологическом порядке — early stop безопасен.

### `lookupTrendVideos` — explicit tool для trend cache

Trend sync бесплатно скачивает сотни видео конкурентов. LLM может выбрать `lookupTrendVideos` вместо `browseChannelVideos` если канал уже tracked — экономия квоты.
