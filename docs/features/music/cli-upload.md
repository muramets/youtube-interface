# Music CLI Upload

## Текущее состояние

Агент в CLI может автономно загружать треки в music library любого канала через tools `listMusicLibrary`, `addMusicGenre`, `addMusicTag`, `uploadTrack`. Поддерживаются vocal + instrumental варианты как единая пара. ID3-метаданные (title, artist, BPM, lyrics, embedded cover art) извлекаются автоматически — пользователя спрашивают только за тем, что отсутствует. После загрузки текстовые метаданные (title, artist, bpm, lyrics, prompt, genre, tags, liked) можно редактировать через `updateTrack`. Waveform peaks **не** генерируются при upload — frontend лениво декодирует аудио при первом рендере track card'а и сохраняет peaks обратно в Firestore, так что следующий рендер мгновенный.

## Что это и зачем

Музыкальный workflow раньше был завязан на UI: открыть Music страницу → drag&drop → заполнить форму → save. Для creator'а, у которого 50+ свежих треков из Suno/Udio — это трение. CLI upload позволяет агенту брать треки из сессии muramets-lab и заливать их в любой канал HackTube с минимальным участием пользователя (только genre + tags).

## User flow

1. Пользователь: "загрузи этот трек: /path/to/song.mp3"
2. Агент: вызывает `listMusicLibrary` → видит доступные genres + tags
3. Агент: читает ID3 → показывает пользователю title, artist, BPM, duration
4. Агент: "Какой genre, tags? BPM: не в ID3."
5. Пользователь: "Lo-Fi, mood-chill + energy-low, BPM 80"
6. Агент: `uploadTrack` → Storage + Firestore
7. Агент: "Готово, trackId abc. Peaks генерируются при первом открытии Music."

## Roadmap

- **Stage 0 (done):** MVP — 4 add/read tools, lazy peaks, dual variants, ID3 cover extraction, target channel routing
- **Stage 0.1 (done):** `updateTrack` — partial patch of text metadata (title, artist, bpm, lyrics, prompt, genre, tags, liked). Validation against channel registry.
- **Stage 1:** Registry management — `updateMusicGenre` / `updateMusicTag` (edit name/color/category), `renameMusicGenre` / `renameMusicTag` (change id + cascade update `tags[]` в tracks), `deleteMusicGenre` / `deleteMusicTag` (cascade remove from tracks). Atomic batch с chunking для >500 tracks.
- **Stage 2:** Track management — `deleteTrack` (Firestore + Storage cleanup), replace audio files (`updateTrackAudio`), replace cover
- **Stage 3:** Batch upload (папка треков → одна команда)
- **Stage 4:** Suno/Udio URL → автоматическое скачивание → upload
- **Stage 5:** Авто-тегирование через Gemini по audio features (прослушивает 30 сек семпл → предлагает tags)
- **Stage 6:** Линковка трека к видео (`linkedVideoIds`) — агент по tags overlap подбирает, куда трек подходит

## Known Limitations (v0.1)

- Registry is **add-only** — rename/delete/update of genres/tags requires UI. Agent must refuse such requests and direct user to UI.
- Track can be updated (text metadata) and uploaded, but cannot be deleted or have its audio/cover files replaced via CLI.
- No batch operations — one track per call.

## Technical Implementation

- **Backend handlers:** `functions/src/services/tools/handlers/music/` (5 файлов: listMusicLibrary, addMusicGenre, addMusicTag, uploadTrack, updateTrack + общий `musicLibrary.ts` для validation + settings I/O)
- **Tool definitions:** `functions/src/services/tools/definitions.ts` (constants в `TOOL_NAMES`, declarations в `TOOL_DECLARATIONS`)
- **Dependency:** `music-metadata` (Node-версия `music-metadata-browser` — same parsing, runs in Node)
- **Storage path:** `users/{userId}/channels/{channelId}/tracks/{trackId}/{variant}.{ext}` (та же структура, что frontend upload)
- **Firestore path:** `users/{userId}/channels/{channelId}/tracks/{trackId}`
- **Download tokens:** генерируются через `crypto.randomUUID()` и вшиваются в `firebaseStorageDownloadTokens` metadata → URL `https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded}?alt=media&token={token}` никогда не expires
- **Lazy peaks на frontend:** `TrackCard.tsx` передаёт callback `onPeaksComputed` в `WaveformCanvas` → при пустых `vocalPeaks`/`instrumentalPeaks` хук `usePeaks` сам качает аудио, декодирует через Web Audio API, вызывает callback → callback пишет peaks через `TrackService.updateTrack()` в Firestore
- **Cleanup on failure:** если Firestore write падает после Storage upload — handler удаляет все orphan файлы через `bucket.file(path).delete()`
- **Cross-channel:** `targetChannelId` параметр (тот же паттерн, что `searchChannelId` в `findSimilarVideos`)
- **Tests:** `functions/src/services/tools/handlers/music/__tests__/` — 44 tests (1122 total backend)
