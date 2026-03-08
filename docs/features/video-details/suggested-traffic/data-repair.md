# Data Repair & Smart Assistant Gate

## Текущее состояние

**Реализовано.** CSV enrichment через YouTube API, cache-first архитектура, gatekeeper-модалка блокирует Smart Assistant при неполных данных. Два варианта модалки: "Update missing data" (sync) и "Smart Assistant Needs Data" (assistant). Unfindable видео (YouTube API не возвращает) сохраняются как stubs и не блокируют ассистента. Broken thumbnails показывают placeholder.

**Известное ограничение:** авто-открытие модалки при загрузке данных срабатывает только для missing titles, не для unenriched видео (missing channelId). Пользователь узнаёт о необогащённых видео только при попытке включить Smart Assistant.

---

## Что это

CSV из YouTube Analytics содержит только базовые метрики (views, impressions, CTR) и video ID. Без обогащения через YouTube API — нет channelId, channelTitle, thumbnail, tags, description. Smart Assistant не может классифицировать ниши без channelId (Harmonic Decay Scoring считает частоту каналов). Поэтому система блокирует активацию ассистента, пока данные не обогащены.

**Аналогия:** представь, что у тебя есть список номеров телефонов, но без имён контактов. Ты можешь их видеть, но не можешь понять "кто мне чаще всего звонит". Data Repair — это как синхронизация контактов: по номеру (videoId) система узнаёт имя канала (channelId) и всё остальное.

---

## Два типа "бедности" данных

| Тип | Признак | Критичность | Когда появляется |
|-----|---------|-------------|------------------|
| **Missing Title** | Пустой `sourceTitle` | Высокая — видео не отображается нормально в таблице | Старый/кривой CSV формат |
| **Unenriched** | Есть title, но нет `channelId` ни в CSV, ни в кэше | Средняя — таблица работает, но Smart Assistant не может классифицировать | Свежий CSV, ещё не прошёл enrichment |

Missing Title подразумевает Unenriched (если нет даже заголовка — channelId тем более нет). Но подсчёт `unenrichedCount` исключает видео, уже посчитанные в `missingCount`, чтобы не дублировать.

---

## User flow

```
CSV загружен / данные загружены из Firestore
    |
    v
useMissingTitles: проверяет каждый videoId
    |
    +-- missingCount: нет sourceTitle?
    +-- unenrichedCount: есть title, но нет channelId ни в CSV, ни в cached_external_videos?
    |
    v
[missingCount > 0?] --YES--> Модалка "Update missing data" (авто-открытие)
    |                                      |
    NO                                     v
    |                              User: Skip / Sync
    v
[User включает Smart Assistant]
    |
    v
[missingCount > 0 OR unenrichedCount > 0?]
    |                   |
    YES                 NO
    |                   |
    v                   v
Модалка               Smart Assistant
"Smart Assistant      активируется
 Needs Data"
    |
    v
User: Skip / Sync
    |
    v (Sync)
repairTrafficSources()
    |
    +-- 1. Собрать все видео без title ИЛИ без channelId
    +-- 2. Дедупликация videoId
    +-- 3. Проверить кэш (cached_external_videos) -> пропустить уже обогащённые
    +-- 4. Остальные -> YouTube API batch (до 50 за раз, 2 units на batch)
    +-- 5. Сохранить в Firestore кэш (cached_external_videos)
    +-- 6. Merge: fetched > cached > original
    |
    v
Обновлённый CSV -> Cloud Storage + Firestore snapshot metadata
    |
    v
Smart Assistant разблокирован -> хуки авто-классификации запускаются
```

### Два варианта модалки (DataRepairModal)

| Вариант | Заголовок | Когда показывается | Блокирует? |
|---------|-----------|-------------------|------------|
| `'sync'` | "Update missing data" | Авто-открытие при `missingCount > 0` | Нет — можно Skip |
| `'assistant'` | "Smart Assistant Needs Data" | При toggle Smart Assistant, если есть missing/unenriched | Да — ассистент не включится до Sync или Skip |

Оба варианта показывают estimated API quota cost и кнопки Skip / Sync.

---

## Cache-first архитектура

Система НЕ бежит сразу в YouTube API. Перед каждым запросом проверяется кэш:

```
displayedSources (videoIds из CSV)
    |
    v
useExternalVideoLookup
    |-- Для каждого videoId: Firestore GET cached_external_videos/{videoId}
    |-- React Query cache: staleTime = Infinity (раз загрузили — не дёргаем)
    |-- Результат: suggestedVideoMap
    |
    v
allVideos = homeVideos + suggestedVideoMap
    |
    v
Передаётся как cachedVideos в useMissingTitles
    |
    v
repairTrafficSources:
    |-- cachedMap = Map(cachedVideos)
    |-- videoIdsToFetch = uniqueVideoIds.filter(id => {
    |       const cached = cachedMap.get(id);
    |       if (!cached) return true;       // нет в кэше -> фетчим
    |       return !cached.channelId;        // в кэше, но без channelId -> фетчим
    |   })
    |
    v
YouTube API вызывается ТОЛЬКО для videoIdsToFetch (промахи кэша)
```

**Экономия:** если видео X появилось в снапшоте #1 и было обогащено — в снапшоте #2 оно подтянется из кэша бесплатно (0 API units).

---

## Roadmap

### Текущее состояние ← YOU ARE HERE
- [x] Missing Titles detection + modal (variant `'sync'`)
- [x] Unenriched detection + modal (variant `'assistant'`)
- [x] `repairTrafficSources()` — batch YouTube API fetch
- [x] Cache-first: `useExternalVideoLookup` → `cached_external_videos`
- [x] CSV regeneration после repair
- [x] Smart Assistant gatekeeper (блокировка активации)
- [x] Unfindable video stubs — видео, которые YouTube API не возвращает (удалённые, приватные), сохраняются в кэш с `notFoundInApi: true` и не блокируют Smart Assistant
- [x] Thumbnail error fallback — `onError` на `<img>` показывает placeholder иконку вместо битой картинки

### Доработки
- [ ] `missingCount` должен проверять кэш перед подсчётом — если title есть в `cached_external_videos`, видео не считается "missing" (сейчас `unenrichedCount` проверяет кэш, а `missingCount` нет — несимметричная логика)
- [ ] Авто-открытие модалки для unenriched видео (не только missing titles)

---

## Связанные фичи
- [Suggested Traffic (README)](./README.md) — основной док фичи
- [Traffic Sources](../traffic-sources.md) — агрегированные метрики по источникам
- [analyzeSuggestedTraffic Tool](../../chat/tools/layer-3-analysis/analyze-suggested-traffic-tool.md) — AI-тул потребляет обогащённые данные из `cached_external_videos`

---

## Technical Implementation

### Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `pages/Details/tabs/Traffic/hooks/useMissingTitles.ts` | Детекция (missingCount, unenrichedCount) + repair action |
| `pages/Details/tabs/Traffic/hooks/useExternalVideoLookup.ts` | Per-document Firestore lookup + React Query cache |
| `pages/Details/tabs/Traffic/modals/DataRepairModal.tsx` | Модалка с двумя вариантами (sync / assistant) |
| `pages/Details/tabs/Traffic/TrafficTab.tsx:233-241` | Авто-открытие модалки (useEffect) |
| `pages/Details/tabs/Traffic/TrafficTab.tsx:1201-1210` | Gatekeeper: блокировка Smart Assistant |
| `core/services/videoService.ts` | `batchUpdateExternalVideos()` — запись в кэш |
| `core/utils/youtubeApi.ts` | `fetchVideosBatch()` — YouTube API batch call |

### Детекция (useMissingTitles.ts)

```
missingCount (строка 131-133):
  displayedSources.filter(s => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === ''))

unenrichedCount (строка 140-154):
  displayedSources.filter(s => {
    if (!s.videoId) return false;
    if (!s.sourceTitle || s.sourceTitle.trim() === '') return false;  // уже в missingCount
    const hasSourceChannelId = !!s.channelId;
    const hasCachedChannelId = cachedMap.has(s.videoId) && !!cachedMap.get(s.videoId)?.channelId;
    return !hasSourceChannelId && !hasCachedChannelId;
  })
```

### Авто-открытие модалки (TrafficTab.tsx:233-241)

```typescript
useEffect(() => {
    if (!pendingUpload && existingMissingCount > 0 && !isRestoringExisting) {
        setIsMissingTitlesModalOpen(true);
    }
}, [existingMissingCount, isRestoringExisting, pendingUpload]);
// NOTE: existingUnenrichedCount НЕ проверяется — модалка не откроется для unenriched
```

### Data paths

```
Firestore cache:  users/{uid}/channels/{channelId}/cached_external_videos/{videoId}
React Query key:  ['externalVideo', userId, channelId, videoId]  (staleTime: Infinity)
```
