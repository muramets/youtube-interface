# Move Video to Channel

← YOU ARE HERE

## Что это

Возможность переместить видео из одного internal-канала в другой, **сохранив всю историю**:
снэпшоты suggested traffic, traffic sources, custom thumbnail, файлы в Storage, позицию в `videoOrder`.

Internal-канал — это пользовательская папка/категория в приложении. Один и тот же YouTube-видеоролик
можно добавить в любую из них; «канал» здесь не равен YouTube-каналу-публикатору.

## Зачем

- Пользователь часто **ошибается с каналом при добавлении** видео (особенно при ручном добавлении custom видео).
- Со временем видео может **логически переехать** в другую категорию (например, из «Cordelia Wilmore» в «slow life piano»).
- Пересоздавать видео руками = потеря всех накопленных снэпшотов и истории за месяцы. Это критично для аналитики деления каналов.

## Текущее состояние

- ❌ UI кнопки нет
- ✅ Cloud Function `moveVideoToChannel` (Stage 1) — реализована, не задеплоена; используется локально через CLI
- ✅ Pure planner `shared/videoMigration.ts` — 17 unit-тестов
- ✅ Cloud Function — 9 integration-тестов с in-memory Firestore mock
- ✅ CLI обёртка `scripts/move-video-to-channel.mjs` — dry-run + --execute режимы
- ✅ Force-home при move: dest doc всегда получает `isPlaylistOnly=false` + свежий `addedToHomeAt`
- ✅ Первая боевая миграция выполнена: `custom-1775644507803` (Cordelia Wilmore → slow life piano)

## User flow (рыночно-готовая версия)

1. Пользователь открывает context menu на video card или в video details page.
2. Кликает «Move to channel…».
3. Видит модалку: список каналов с поиском + превью «что переедет» (количество снэпшотов, файлов, playlist-ссылок).
4. Подтверждает действие.
5. Видит progress bar.
6. По завершении — toast с кнопкой «Open new channel» + автоматический navigate.
7. Source-канал в UI обновляется (видео исчезает), dest-канал получает запись.

## Roadmap

### Stage 1 — Backend ядро ✅ ЗАВЕРШЁН

Цель: иметь надёжную серверную операцию переноса. UI пока нет — миграции делаются через CLI обёртку.

- [x] Pure planner-функция: на вход source/dest channelId, video doc, snapshot документы → на выход обновлённые документы (с переписанными storage paths).
- [x] Callable Cloud Function `moveVideoToChannel(sourceChannelId, destChannelId, videoId)`:
  - Использует admin SDK + `listCollections()` (защита от забытых subcollections в будущем).
  - Алгоритм: read source → call planner → write dest → copy storage → update videoOrder → verify dest → delete source.
  - При сбое **source остаётся целым**, dest может быть частичным — recovery через повторный запуск с очисткой dest.
- [x] Unit-тесты planner: 17 кейсов (валидация, customImage, snapshot.storagePath, encoded URLs, edge cases).
- [x] Integration-тесты Cloud Function: 9 кейсов с in-memory Firestore mock (validation paths + happy path + atomicity contract + force-home).
- [x] CLI скрипт `move-video-to-channel.mjs` — dry-run inspection по умолчанию, `--execute` для реального переноса. Импортирует `runMove` из скомпилированной функции (single source of truth).
- [x] Применить к видео `custom-1775644507803`: Cordelia Wilmore → slow life piano. Перенесено: 3 docs (main + 2 subcollections), 15 storage файлов, 0 playlist refs.

### Stage 2 — Базовый UI

- [ ] Frontend hook `useMoveVideo()` — обёртка над callable function + invalidation TanStack Query.
- [ ] Кнопка «Move to channel…» в video card context menu.
- [ ] Простая модалка: dropdown со списком каналов + кнопка confirm.
- [ ] Toast по завершении.

### Stage 3 — Рыночно-готовая версия

- [ ] Поиск по каналам в модалке.
- [ ] Preview «что переедет» (counts по snapshot/playlist/storage).
- [ ] Progress UI с этапами (copying docs → copying storage → cleanup).
- [ ] Optimistic UI updates.
- [ ] Auto-navigate на dest channel после успеха.
- [ ] Контекстное меню также в video details page.
- [ ] Логирование операций (audit trail) для возможного undo.

### Не в скоупе

- Bulk move (несколько видео сразу).
- Cross-user move.
- Undo (требует audit log + временное хранение).

## Edge cases (Stage 1)

- ❌ source === dest → отказ.
- ❌ Видео не существует в source-канале → отказ.
- ❌ Видео уже существует в dest-канале → отказ (защита от повторного запуска без cleanup).
- ❌ Source или dest канал не существует → отказ.
- ✅ Snapshot без `storagePath` (легаси) → обрабатывается без падения.
- ✅ Пустая subcollection → пропускается.
- ✅ Playlist в source-канале содержит видео → ссылка удаляется. В dest-канал НЕ копируется автоматически (playlists scoped на канал, нет смысла переносить).
- ✅ Видео всегда добавляется в Home канала-получателя: `isPlaylistOnly=false` + `addedToHomeAt=Date.now()`. Cmысл: move = намеренное действие пользователя, видео должно сразу быть видно (часто наверху списка).

## Связанные фичи

- `docs/features/sync-architecture.md` — как видео синхронизируются с YouTube. Move не должен пересекаться с активной синхронизацией.
- `docs/features/video-details/traffic-sources.md`, `suggested-traffic/` — какие данные снэпшотов переезжают.
- `docs/features/playlists/` — playlists scoped на канал, переезжают без видео.

---

## Technical Implementation

### Файлы (Stage 1)

- `shared/videoMigration.ts` — pure planner, экспортирует:
  - `planVideoMigration(args)` → `{ mainDoc, subcollectionDocs }` с переписанными storage paths.
  - `replaceChannelInPath(path, sourceChannelId, destChannelId)` — утилита для path replacement.
- `functions/src/video/moveVideo.ts` — callable Cloud Function `moveVideoToChannel`.
- `functions/src/video/__tests__/moveVideo.test.ts` — integration-тесты.
- `shared/__tests__/videoMigration.test.ts` — unit-тесты planner.
- `scripts/move-video-to-channel.mjs` — CLI обёртка (admin SDK, повторяет логику локально для one-off).

### Firestore структура источника видео

- Главный doc: `users/{uid}/channels/{srcChannelId}/videos/{videoId}`
- Subcollections (известные):
  - `traffic/main` — suggested traffic snapshots (массив, snapshots[i].storagePath ссылается на channel folder).
  - `trafficSource/main` — traffic source snapshots (то же самое).
- Storage: `users/{uid}/channels/{srcChannelId}/videos/{videoId}/...`
- Settings: `users/{uid}/channels/{srcChannelId}/settings/videoOrder` — массив с videoId.
- Playlists: `users/{uid}/channels/{srcChannelId}/playlists/*` — могут содержать videoId в массиве `videoIds`.

### Поля в главном doc'е, требующие path replacement

- `customImage` — download URL содержит url-encoded путь со старым channelId.
- (Расширяется по мере появления других storage URL полей.)

### Алгоритм Cloud Function (high-level)

1. Validate inputs (source ≠ dest, channels exist, source video exists, dest video doesn't exist).
2. Read main doc + все subcollections (через `listCollections()`).
3. Call `planVideoMigration` → получить новые версии docs с переписанными paths.
4. Write всё в dest (batch).
5. Copy storage файлы: `bucket.file(old).copy(new)` для каждого.
6. Update `videoOrder` в обоих каналах.
7. Verify: dest doc и subcollections существуют, storage файлы скопированы.
8. Delete source: subcollections → main doc → storage folder.
9. Update playlists в source: убрать videoId из всех playlists, где он есть.

### Атомарность

- Firestore docs внутри одного канала переезжают через `WriteBatch` (атомарно).
- Storage copy → delete не атомарно. Стратегия: всё пишем в dest, верифицируем, и только потом удаляем source. При сбое source целый.
- Конкурентные операции (auto-sync, snapshot upload) во время move могут привести к рассинхрону. В Stage 1 — документировать как known limitation. В Stage 3 — оптимистичная блокировка через revision поле.

### Тесты

- Planner (unit): same-channel detection, path replacement в `customImage`, в `snapshot[i].storagePath`, обработка пустых subcollections, snapshot без storagePath.
- Cloud Function (integration с Firestore emulator): happy path с реальными docs/snapshots, отказ при существующем dest, отказ при отсутствующем source, корректное удаление playlist references.
