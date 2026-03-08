# AI Tool: getChannelOverview — Feature Doc

## Текущее состояние

**Реализовано.** Telescope Pattern Layer 1 — resolve. LLM передаёт URL, @handle или channel ID → получает метаданные канала + `uploadsPlaylistId` для `browseChannelVideos`. Всегда безопасен (1-2 API units). Содержит QUOTA_GATE `_systemNote`, указывающий LLM спросить пользователя перед дорогими операциями.

**Зависимость:** Требует YouTube Data API key, сохранённый в Settings → API Key. Ключ читается из channel-scoped настроек: `users/{uid}/channels/{channelId}/settings/general` → поле `apiKey`. Без ключа handler вернёт ошибку, а pill покажет красный статус "Couldn't load channel info".

---

## Что это

Точка входа в YouTube research. Прежде чем анализировать видео канала, LLM должна знать: сколько видео на канале и сколько квоты это будет стоить. `getChannelOverview` отвечает на оба вопроса за минимальную цену.

---

## User flow

1. Пользователь: *"Вот ссылка на канал — посмотри, что они публикуют"*
2. LLM вызывает `getChannelOverview` с URL
3. Handler резолвит канал → возвращает метаданные + quota estimate
4. LLM спрашивает пользователя: *"47 видео, ~2 единицы квоты. Запустить?"*
5. Пользователь подтверждает → LLM вызывает `browseChannelVideos`

---

## Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `channelId` | string (required) | YouTube channel URL, @handle, или raw channel ID |

---

## Что возвращает

```typescript
{
    _systemNote: "QUOTA_GATE: 47 videos, up to ~2 units. Ask user.",
    channelId: string,
    channelTitle: string,
    handle: string,
    videoCount: number,
    subscriberCount: number,
    uploadsPlaylistId: string,  // required for browseChannelVideos
    quotaCost: number,          // estimated cost for browseChannelVideos
    quotaUsed: number,          // actual cost of this call (1-2 units)
}
```

---

## Связанные фичи

- [Telescope Pattern Overview](../README.md)
- [browseChannelVideos](./2-browse-channel-videos-tool.md) — следующий шаг (требует `uploadsPlaylistId`)

---

## Technical Implementation

| Файл | Назначение |
|------|-----------|
| `functions/src/services/tools/handlers/getChannelOverview.ts` | Handler: resolve + channel info + quota estimate |
| `functions/src/services/tools/definitions.ts` | Tool declaration |
| `functions/src/services/youtube.ts` | `resolveChannelId()`, `getChannelInfo()` |
| `functions/src/chat/aiChat.ts` | Собирает `ToolContext` (читает `youtubeApiKey` из channel settings) |
| `src/features/Chat/components/ToolCallSummary.tsx` | `ChannelOverviewStats` — pill stats (defensive rendering при ошибках) |

### Tests

| Файл | Кейсов |
|------|--------|
| `functions/src/services/tools/handlers/__tests__/getChannelOverview.test.ts` | — |
