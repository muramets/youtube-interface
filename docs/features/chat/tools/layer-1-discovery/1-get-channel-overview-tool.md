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

---

## Battle Testing

Статус проверки инструмента в реальных диалогах (не unit-тесты, а production traces с живыми данными).

### План проверки

| # | Сценарий | Что проверяет | Промпт-идея | Проверено |
|---|----------|---------------|-------------|-----------|
| 1 | **URL resolution** | Channel URL → channelId + metadata | "Посмотри что за канал https://youtube.com/@MrBeast" | — |
| 2 | **@handle resolution** | @handle → channelId (resolveChannelId path) | "Расскажи про канал @veritasium" | ✅ |
| 3 | **QUOTA_GATE compliance** | Спрашивает ли LLM пользователя перед browseChannelVideos | (любой channel overview → ожидаем вопрос "N видео, ~M units. Запустить?") | ✅ |
| 4 | **Chain → browseChannelVideos** | LLM передаёт uploadsPlaylistId, channelId в следующий call | (ожидаем: overview → user confirms → browseChannelVideos с правильными args) | ✅ |
| 5 | **Own channel** | Свой канал → LLM узнаёт и не тратит quota зря (видео уже в videos/) | "Расскажи про мой канал" (или URL своего канала) | — |
| 6 | **Invalid channel** | Graceful error на несуществующий канал | URL с несуществующим каналом или опечатка | — |
| 7 | **quotaCost accuracy** | Совпадает ли quotaCost estimate с реальным quotaUsed в browseChannelVideos | (сравнить quotaCost из overview с quotaUsed из browse) | ✅ |

### Ключевые вопросы

1. ~~**QUOTA_GATE эффективность**~~ — ✅ Подтверждено: LLM спрашивает пользователя, не вызывает `browseChannelVideos` без разрешения.
2. **URL parsing edge cases** — Работает ли handler с разными форматами URL (youtube.com/channel/UC..., youtube.com/@handle, youtu.be/, shorts URL)?
3. **subscriberCount visibility** — Скрытый subscriber count (YouTube позволяет прятать) → что возвращает API?
4. ~~**uploadsPlaylistId relay**~~ — ✅ Подтверждено: LLM передаёт дословно, не угадывает.

### Проверено в бою

<details>
<summary>#2 @handle resolution ✅ + #3 QUOTA_GATE compliance ✅ (2026-03-13, claude-haiku-4-5)</summary>

- **Trace:** `trace--livresdanse-4548c160.json`
- **Промпт:** "Покажи мне все видео канала @livresdanse" (провокация — прямой запрос на действие)
- **@handle resolution:** LLM передала `channelId: "@livresdanse"` → handler зарезолвил в `channelId: "UCHw-FmDg7RVH7A6opPZINnA"`, вернул `handle: "@livresdanse"` + полные метаданные.
- **QUOTA_GATE:** LLM вызвала только `getChannelOverview` (1 tool call), прочитала `_systemNote` и спросила пользователя: *"60 видео, ~4 единицы квоты. Ты согласен?"* — `browseChannelVideos` НЕ вызван без подтверждения.
- **Нюанс:** формулировка "Сейчас загружу... Ты согласен?" — чуть противоречива (говорит "сейчас", но ждёт). Поведение корректное, косметика.
- **Вывод:** `_systemNote` QUOTA_GATE паттерн работает — LLM подчиняется инструкции в tool result.
</details>

<details>
<summary>#4 Chain → browseChannelVideos ✅ + #7 quotaCost accuracy ✅ (2026-03-13, claude-haiku-4-5)</summary>

- **Trace:** `trace--livresdanse-4548c160 (1).json` (продолжение того же диалога)
- **Промпт:** пользователь ответил "да" на QUOTA_GATE вопрос
- **Chain integrity:** LLM передала `uploadsPlaylistId: "UUHw-FmDg7RVH7A6opPZINnA"` и `channelId: "UCHw-FmDg7RVH7A6opPZINnA"` дословно из результата `getChannelOverview` — не угадывала, не трансформировала.
- **quotaCost accuracy:** overview предсказал `quotaCost: 4`, browse потратил `quotaUsed: 4` — точное совпадение.
- **Нюанс:** `videoCount: 60` (overview) vs `totalVideosOnYouTube: 61` (browse) — расхождение на 1 видео (вероятно live stream или разница в подсчёте API). Не влияет на quota estimate.
- **Вывод:** tool chain работает корректно, LLM relay'ит структурные зависимости без ошибок.
</details>

### Ещё не проверено в бою

| Сценарий | Почему важно |
|----------|-------------|
| **URL format variety** | Пользователи копируют URL из разных мест (адресная строка, share menu, мобайл) |
| **Own channel detection** | Тратить quota на свой канал бессмысленно если видео уже в Firestore |
