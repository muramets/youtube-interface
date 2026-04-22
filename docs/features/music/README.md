# Music Library & Audio Player

> Библиотека треков креатора с встроенным плеером внизу страницы. Запускаешь трек — можно ходить по приложению, а трек продолжает играть. Как Spotify, только внутри твоего приложения.

## Текущее состояние

**Core — DONE.** Загрузка/тримминг треков, vocal/instrumental варианты, waveform, фильтры (жанр/теги/BPM), плейлисты, Liked, лайки, drag-and-drop в плейлисты, shared libraries (владелец открывает доступ другому креатору).

**Playback stability — DONE (2026-04-17).** Починены два бага, которые проявлялись только в stock Chrome:
1. Media keys на Magic Keyboard (play/next/prev) не маршрутились в таб — Chrome требует явный `navigator.mediaSession.playbackState`, Arc/Safari авто-детектят.
2. Skip и auto-advance молча не работали, если играющий трек выпадал из очереди (unlike во время playback из плейлиста «Liked» → трек становился «сиротой» в очереди).

**Seamless shared library across channels — DONE (2026-04-22).** И треки, и плейлисты носят `ownerUserId`/`ownerChannelId` (stamped at read-time из пути Firestore — не persist'ится). Любое действие (edit, delete, like, trim, group ops, playlist add/remove/reorder) всегда уходит в оригинальную библиотеку независимо от того, из какого канала юзера открыто. Per-track permissions: same user → full, cross-user grant → grant's permissions. Per-channel persistence выбранной shared library: `music_active_lib:${granteeChannelId}`. Edit Track modal загружает genres/tags из библиотеки-владельца. `saveSettings` не трогает own state когда сохраняем в шаренную библу (нет flicker).

← YOU ARE HERE: Core + stability + seamless multi-channel complete. Дальнейшие идеи — в Roadmap.

---

## Что это такое

Креатор загружает треки, которые он использует как фон для YouTube-видео. Каждому треку можно прикрепить vocal и instrumental версии — переключаешься одной кнопкой прямо в плеере. Треки группируются по жанру, тегам, BPM. Можно собирать плейлисты, ставить лайки, делиться библиотекой с коллегой.

**Бизнес-ценность:** централизованная библиотека музыки, которую креатор подбирает под свои форматы. Внутри приложения ничего не нужно качать — кликнул трек, он играет, пока ты редактируешь видео на другой странице. Shared libraries экономят время, когда в команде несколько монтажёров работают с одной музыкальной базой.

---

## User Flow

### Воспроизведение
1. На `/music` креатор видит список треков, отсортированный и отфильтрованный под свой сценарий.
2. Клик по треку → плеер внизу начинает играть, строится **очередь воспроизведения** из того, что видно сейчас (фильтр + сортировка).
3. Креатор уходит на другую страницу → трек продолжает играть, плеер остаётся внизу.
4. Когда трек доигран, автоматически включается следующий из очереди.
5. Кнопки Skip в плеере (или media keys на клавиатуре) — листают очередь вперёд/назад.

### Очередь и контекст
Очередь «защёлкивается» на view, из которой трек запущен: если запустил из плейлиста «Liked» и ушёл в другой плейлист, очередь всё равно останется liked-овой, пока трек играет. Это сделано чтобы Skip продолжал работать осмысленно.

Защита от «осиротевшего» трека: если во время playback креатор снимет лайк (или иначе изменит данные так, что трек перестанет попадать в текущий фильтр), очередь **не** перестраивается без него. Плеер продолжает работать.

### Тримминг
Любой трек можно обрезать и добавить fade-out прямо из плеера (кнопка Scissors). Серверный ffmpeg-job в Cloud Run перекодирует дорожку, пересчитывает peaks, возвращает новый URL. Пока идёт обработка — плеер показывает индикатор загрузки, но не ломает воспроизведение.

### Shared libraries
Владелец библиотеки выдаёт другому креатору permissions (read / edit). Плеер при воспроизведении shared-трека использует credentials владельца для мутаций (лайк, тримминг), а UI скрывает действия, которые permissions не разрешают.

---

## Roadmap

### Core ✅
- [x] Загрузка vocal + instrumental, covers
- [x] Waveform рендер (peaks из storage, рекомпьют при trim)
- [x] Фильтры (жанр, теги, BPM)
- [x] Плейлисты + Liked
- [x] Drag-and-drop трека в плейлисты
- [x] Shared libraries + permissions (read / edit)
- [x] Серверный trim + fade-out (Cloud Run + ffmpeg)
- [x] Variant switch (vocal ↔ instrumental) в плеере с сохранением timecode
- [x] Авто-обновление URL при истечении Firebase Storage token (403 → refresh)
- [x] Tab persistence: плеер живёт сверху всех страниц

### Playback stability ✅
- [x] MediaSession: explicit `playbackState` для Chrome (media keys)
- [x] Queue guard: не дропать играющий трек при rebuild очереди
- [x] Navigation fallback: при orphan-треке Skip/auto-advance восстанавливается с начала очереди

### Seamless multi-channel ✅
- [x] `Track` carries `ownerUserId`/`ownerChannelId` — stamped at subscription
- [x] `MusicPlaylist` carries `ownerUserId`/`ownerChannelId` — stamped at subscription
- [x] All track-level mutations (update, delete, like, trim, group ops) target track's original library
- [x] All playlist-level mutations (update, delete, reorder, add/remove tracks) target playlist's original library
- [x] `resolveTrackPermissions` — same-user access across own channels = OWNER_PERMISSIONS
- [x] Library Settings (genres/tags) route to active library's owner path
- [x] Edit Track modal reads genre/tag definitions from the library that owns the track
- [x] `saveSettings` skips optimistic own-state update when target is a shared library (no UI flicker)
- [x] Per-channel persistence of last opened shared library (legacy key migrated)

### Nice-to-have (future)
- [ ] Shuffle режим
- [ ] Crossfade между треками
- [ ] Keyboard shortcuts (J/L — seek, K — play/pause, как на YouTube)
- [ ] Глобальный поиск по всем библиотекам (включая shared)
- [ ] AI-подбор похожих треков (по жанру, BPM, tags)

---

## Technical Implementation

### Структура
- **`src/pages/Music/`** — page, sidebar, модалки
  - `components/AudioPlayer.tsx` — глобальный плеер, композиция хуков + UI
  - `components/WaveformCanvas.tsx` — canvas-рендер waveform
  - `hooks/useAudioEngine.ts` — `<audio>` lifecycle: src transitions, retry, volume, seek, onEnded
  - `hooks/usePlaybackNavigation.ts` — Skip/Prev для library и timeline режимов
  - `hooks/useMediaSessionPlaybackState.ts` — sync `playbackState` с `isPlaying`
  - `hooks/useTrimMode.ts` — trim + fade-out UX
  - `hooks/useTrackDisplay.ts` — фильтры, сортировка, grouping, сборка очереди
  - `utils/queueGuard.ts` — чистая функция `shouldRebuildQueue` (решает, пересобирать ли очередь)

- **`src/core/stores/music/`** — state
  - `slices/playbackSlice.ts` — playingTrackId, isPlaying, queue, volume, repeatMode
  - `slices/librarySlice.ts` — tracks, shared, genres, tags
  - `slices/playlistSlice.ts` — музыкальные плейлисты CRUD

- **`src/core/services/music/trackService.ts`** — CRUD треков в Firestore + Storage

- **`functions/src/audio/trimAudioFile.ts`** — серверный trim через ffmpeg на Cloud Run

### MediaSession
Реализация в `useMediaSessionPlaybackState` + основной эффект с metadata и action handlers в `AudioPlayer.tsx`. Разделение намеренное: metadata/handlers обновляются при смене трека (тяжёлый эффект), а `playbackState` — при каждой смене `isPlaying` (лёгкий эффект, мгновенная реакция). Chrome требует `playbackState !== 'none'`, иначе media keys уходят мимо.

### Queue invariant
Очередь в `playbackQueue` должна **всегда** содержать `playingTrackId`, пока он не `null`. `shouldRebuildQueue` в `src/pages/Music/utils/queueGuard.ts` — единственное место, где решается пересборка, и оно проверяет оба инварианта (context match + playing track inclusion). `handleNext`, `handlePrevious` и `onEnded` в `useAudioEngine.ts` держат страховочный fallback на случай, если инвариант нарушится — играть первый трек очереди.

### Track & Playlist ownership (data-carries-context)
Both `Track` and `MusicPlaylist` carry `ownerUserId`/`ownerChannelId`. These are **not** stored in Firestore — they are stamped onto every doc by `TrackService.subscribeToTracks` / `MusicPlaylistService.subscribeToPlaylists` from the path the subscription targets. Legacy records still work; stored fields can't drift from the path. All downstream mutations read owner directly from the entity — no more deriving from UI state (`activeLibrarySource`), which broke in mixed-mode "All" and when playback continued after navigating away from `/music`.

**Playlist signature simplification:** `updatePlaylist`, `deletePlaylist`, `addTracksToPlaylist`, `removeTracksFromPlaylist`, `reorderPlaylistTracks` no longer take `(userId, channelId, ...)` — slice resolves owner from the playlist itself. `createPlaylist` keeps explicit credentials since the creation target is a caller decision (own vs shared).

`resolveTrackPermissions(track, currentUserId, sharedLibraries)` in `src/core/utils/trackUtils.ts` resolves per-track permissions. Rule hierarchy: same user → `OWNER_PERMISSIONS`; different user with matching grant → grant's permissions; otherwise `DEFAULT_SHARE_PERMISSIONS`. The same-user rule is what powers seamless multi-channel UX.

### Active shared library persistence
Key: `music_active_lib:${granteeChannelId}` in localStorage. Each of the user's own channels remembers its own last opened shared library. Read/write wrappers live inside `librarySlice.ts`; a one-time migration copies the old global key `music_active_library_channel_id` into the per-channel slot on first read.

### Тесты
- `src/pages/Music/hooks/__tests__/usePlaybackNavigation.test.ts` — Skip/Prev behavior, orphan recovery, repeat modes
- `src/pages/Music/hooks/__tests__/useMediaSessionPlaybackState.test.ts` — `playbackState` sync с флагами
- `src/pages/Music/utils/__tests__/queueGuard.test.ts` — решение пересборки очереди
- `src/core/utils/__tests__/resolveTrackPermissions.test.ts` — per-track permissions logic (7 tests)
- `src/core/stores/music/__tests__/playlistSlice.test.ts` — owner-resolved playlist mutations (12 tests)
- `src/core/stores/music/__tests__/librarySlice.test.ts` — `saveSettings` own-vs-shared routing (3 tests)
