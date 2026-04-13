# Packaging Check-ins — Feature Doc

## Текущее состояние

**Stages 1-2 реализованы.** Scheduler создаёт уведомления "Packaging Check-in Due" по расписанию (правила в Settings). Check-in привязан к **загрузке traffic snapshot** — оба CSV (Suggested Traffic + Traffic Sources) должны быть загружены после due date. Поддержка загрузки из любого места: CheckinUploadModal (клик на notification), Traffic tab, TrafficSource tab. Scheduler проверяет денормализованные timestamps на video doc. Batch writes (один onSnapshot), dismiss вместо delete для checkin notifications, auto-cleanup для failed видео.

---

## Что это

Система напоминаний для периодической фиксации трафика видео. После публикации видео на YouTube, пользователь настраивает контрольные точки (например: 24 часа, 48 часов, 7 дней). В каждой точке система напоминает: "пора загрузить CSV snapshot из YouTube Analytics". Это позволяет отслеживать, как YouTube раскручивает видео — от первых часов до стабилизации.

**Ключевой вопрос, на который отвечает:** *"Прошло 48 часов после публикации — пора зафиксировать, сколько impressions и CTR YouTube дал видео через Suggested, Browse и Search. Загрузи CSV, пока данные актуальны."*

### Связь с Traffic табами

Check-in = напоминание загрузить два CSV, которые уже используются в Traffic Sources и Suggested Traffic табах. Никакого нового формата данных — те же самые snapshot'ы, просто привязанные к расписанию.

| CSV | Таб | Что даёт |
|-----|-----|----------|
| Traffic Sources | Traffic Sources tab | Откуда пришёл трафик (Suggested, Browse, Search...) |
| Suggested Traffic | Suggested Traffic tab | Рядом с какими видео YouTube рекомендует |

---

## User Flow

### Настройка правил (Settings)
1. User → Settings → Packaging Check-ins
2. Добавляет правила: "24 hours snapshot" (1 day), "48 hours snapshot" (2 days), "7 days snapshot" (1 week)
3. Каждое правило = время после публикации + badge text + цвет

### Получение уведомления
1. Видео опубликовано, проходит 24 часа
2. Scheduler создаёт notification: "Time to check in on 'Video Title' (24 hours snapshot)"
3. Значок 🔔 в header показывает unread count

### Загрузка snapshot (из уведомления)
1. User кликает notification → открывается **CheckinUploadModal**
2. Модалка показывает: thumbnail видео, название, badge правила
3. Два drop zone: "Suggested Traffic CSV" + "Traffic Sources CSV"
4. User загружает оба CSV
5. Snapshot'ы создаются с label = badge text правила (e.g. "24 hours snapshot")
6. Notification исчезает

### Загрузка snapshot (обычный путь)
1. User загружает CSV напрямую в Traffic Sources tab или Suggested Traffic tab
2. Scheduler на следующем tick проверяет: "есть snapshot после due date?"
3. Если оба типа snapshot'ов загружены → notification автоматически исчезает
4. **Не важно, через какой UI загружен** — важна дата загрузки

### Правило завершения
Check-in считается выполненным, когда **оба** CSV загружены после due date:
- `lastSuggestedTrafficUpload >= dueDate` **И** `lastTrafficSourceUpload >= dueDate`
- Один snapshot на T+7d закрывает ВСЕ правила с меньшим интервалом (24h, 48h, 96h)

---

## Roadmap

### Stage 1 — Scheduler + Notifications ✅
- [x] Check-in правила в Settings (CRUD, цвета, badge text)
- [x] `useCheckinScheduler`: расчёт due date, создание notifications
- [x] `calculateDueDate`: учёт 12:00 YouTube Analytics sync time
- [x] Persistent notifications (dismiss = markAsRead, не delete)
- [x] Idempotent notification IDs (`checkin-due-{videoId}-{ruleId}`)
- [x] Auto-cleanup orphaned check-ins при удалении правил

### Stage 2 — Snapshot-Based Completion ✅
Check-in привязан к загрузке traffic snapshot. Batch writes, dismiss UX, failed video cleanup.

- [x] **Денормализация:** при загрузке snapshot — писать timestamp на video doc (`lastSuggestedTrafficUpload`, `lastTrafficSourceUpload`)
- [x] **Scheduler:** проверка snapshot timestamps вместо `PackagingCheckin.metrics`. Оба CSV обязательны
- [x] **Batch writes:** все notifications создаются/удаляются одним `writeBatch` → один `onSnapshot` → всё сразу
- [x] **Dismiss UX:** checkin notifications — кнопка EyeOff (dismiss = markAsRead), не delete. Notification остаётся в Firestore, scheduler не пересоздаёт
- [x] **Failed video cleanup:** видео с `fetchStatus: 'failed'` — scheduler удаляет существующие notifications, не создаёт новых
- [x] **CheckinUploadModal:** модалка с 2 CsvDropZone, вызывается из notification click. Label = badge text правила. Auto-close при обоих uploads
- [x] **Backfill migration:** `scripts/backfill-snapshot-timestamps.mjs` — одноразовый скрипт для записи timestamps из существующих snapshot'ов
- [x] **Удаление мёртвого кода:** убран auto-create `PackagingCheckin` rows с null metrics из scheduler

### Stage 3 — Polish ← YOU ARE HERE
- [ ] **Partial progress:** notification показывает какие CSV уже загружены (e.g. "1/2 uploaded")
- [ ] **Quick-upload из sidebar:** кнопка upload в sidebar версии (не только из notification)
- [ ] **Auto-label improvement:** если upload из CheckinUploadModal — label = badge text; если обычный upload — сохранить текущий auto-label ("13 hours", "3 days")

### Production
**User flow:** Пользователь публикует видео, настраивает 4 check-in правила. Через 24 часа приходит notification. Кликает → модалка → загружает 2 CSV → snapshot сохранён с именем "24 hours snapshot" → notification исчезает. Через 48 часов — следующее напоминание. И так до последнего правила. AI может использовать эти snapshot'ы для анализа динамики трафика через `analyzeTrafficSources` и `analyzeSuggestedTraffic`.

- [ ] **Хранение:** те же Firestore collections + Cloud Storage что и обычные snapshot'ы. Zero new infrastructure
- [ ] **Стоимость:** Firestore writes при загрузке + Storage. Нет внешних API
- [ ] **Надёжность:** работает и без notification — обычная загрузка в Traffic tab тоже закрывает check-in

---

## Связанные фичи

- [Packaging](./packaging.md) — версионирование, форма, A/B тесты
- [Suggested Traffic](./suggested-traffic/README.md) — CSV upload, enrichment, AI analysis
- [Traffic Sources](./traffic-sources.md) — CSV upload, delta mode, timeline
- [Notification Categories](../notification-categories.md) — category: `checkin`
- Settings → PackagingSettingsView — CRUD для check-in правил

---

## Technical Implementation

### Новые поля на video document
```
Firestore: users/{uid}/channels/{channelId}/videos/{videoId}
  lastSuggestedTrafficUpload: number    // timestamp последней загрузки suggested traffic CSV
  lastTrafficSourceUpload: number       // timestamp последней загрузки traffic sources CSV
```

Записываются при `TrafficSnapshotService.create()` и `TrafficSourceService.create()`. Scheduler читает через `useVideos()` — никаких дополнительных запросов.

### Frontend
| Файл | Назначение |
|------|-----------|
| `features/Notifications/CheckinUploadModal.tsx` | Модалка: video info + badge + 2 CsvDropZone + upload handlers. Reuse `parseTrafficCsv`, `parseTrafficSourceCsv`, сервисы upload |
| `features/Notifications/NotificationDropdown.tsx` | Клик на checkin notification → `openCheckinUpload()` (uiStore). Парсит videoId из `internalId`, badgeText из message |
| `core/hooks/useCheckinScheduler.ts` | Snapshot timestamps completion, batch writes, failed video cleanup, `getState()` для notifications (no cascade) |
| `core/stores/uiStore.ts` | `checkinUpload` state + `openCheckinUpload` / `closeCheckinUpload` actions |
| `core/stores/notificationStore.ts` | `addNotificationsBatch` action для batch writes |
| `core/services/notificationService.ts` | `addNotificationsBatch` — single `writeBatch` для множества notifications |
| `features/Notifications/NotificationItem.tsx` | Checkin: EyeOff dismiss вместо Trash2 delete |
| `core/services/traffic/syncSnapshotCount.ts` | Расширен: optional `uploadTimestampField` param для записи timestamp рядом с count |
| `core/services/traffic/TrafficSnapshotService.ts` | `create()` → `syncSnapshotCount` с `lastSuggestedTrafficUpload` |
| `core/services/suggestedTraffic/TrafficSourceService.ts` | `create()` → `syncSnapshotCount` с `lastTrafficSourceUpload` |
| `core/utils/youtubeApi.ts` | `VideoDetails` type: + `lastSuggestedTrafficUpload`, `lastTrafficSourceUpload` |
| `components/Layout/Sidebar.tsx` | Рендер `CheckinUploadModal` (рядом с SettingsModal) |

### Scheduler — логика completion
```
Для каждого custom video (с publishedVideoId):
  1. fetchStatus === 'failed' → удалить существующие notifications, skip
  2. Для каждого правила:
     dueDate = calculateDueDate(publishedAt, rule.hoursAfterPublish)
     isComplete = lastSuggestedTrafficUpload >= dueDate AND lastTrafficSourceUpload >= dueDate
     → complete: batch-remove notification
     → due & not complete: batch-create notification (если не exists)
  3. Batch commit: один writeBatch для всех create, один для всех remove
```

### Reuse существующей инфраструктуры
- CSV парсеры: `parseTrafficCsv()`, `parseTrafficSourceCsv()` — без изменений
- Upload сервисы: `TrafficSnapshotService.create()`, `TrafficSourceService.create()` — + 1 строка денормализации
- Drop zone: `CsvDropZone` molecule — reuse
- Column mapper modals: reuse при ошибке парсинга

### Data paths (существующие, без изменений)
```
Suggested Traffic:
  Metadata: users/{uid}/channels/{cid}/videos/{vid}/traffic/main
  CSV:      Cloud Storage: users/{uid}/channels/{cid}/videos/{vid}/snapshots/{snapshotId}.csv

Traffic Sources:
  Metadata: users/{uid}/channels/{cid}/videos/{vid}/trafficSource/main
  CSV:      Cloud Storage: users/{uid}/channels/{cid}/videos/{vid}/trafficSources/{snapshotId}.csv
```
