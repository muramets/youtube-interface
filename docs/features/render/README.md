# Render Pipeline

## Что это

Серверный рендеринг видео. Пользователь собирает аудио-таймлайн на вкладке Editing (треки, громкость, обрезка, loop, обложка) и нажимает Render. Видео собирается на мощном сервере Google Cloud (8 CPU, ffmpeg), а не на компьютере пользователя. Результат — MP4, оптимизированный для YouTube, со ссылкой на скачивание (24 часа).

## Текущее состояние  <!-- YOU ARE HERE -->

- Серверный рендер через Cloud Run Job (ffmpeg, H.264 High Profile, AAC 320kbps)
- 4 варианта качества: 720p / 1080p / 1440p / 4K (автовыбор по размеру обложки)
- Очередь задач Cloud Tasks (1 рендер за раз, retry при ошибках)
- Прогресс-бар в реальном времени через Firestore onSnapshot
- Отмена рендера на любом этапе (cancellation listener + AbortController)
- Удаление рендеров (Cloud Function + очистка R2)
- Render Presets — автосохранение timeline после успешного рендера (до 20 на канал), загрузка в новое видео одним кликом
- Idempotency: повторный запуск Cloud Run Job не создает дубликат, если файл уже в R2
- Multipart upload для файлов более 100 MB
- Оценка размера файла на клиенте (с калибровкой по прошлым рендерам)
- User-friendly маппинг ошибок (OOM, ffmpeg crash, timeout → понятные сообщения)

## User Flow

1. Вкладка **Editing** — пользователь добавляет аудио-треки на таймлайн, настраивает громкость, обрезку, loop count
2. Выбирает обложку (или используется дефолтная от видео)
3. Качество выбирается автоматически (макс. доступное для размера обложки), но можно переключить вручную
4. Видит оценку длительности и размера файла
5. Нажимает **Render** — появляется прогресс-бар со стадиями (Downloading → Encoding X% → Uploading → Generating link)
6. Глобальный FAB-индикатор показывает прогресс на любой странице
7. Готово — кнопка **Download** (ссылка 24 часа)
8. Может **отменить** в любой момент или **удалить** готовый рендер
9. При следующем рендере — может загрузить preset из прошлого рендера

## Roadmap

- [x] Базовый pipeline: Cloud Function → Cloud Tasks → Cloud Run → ffmpeg → R2
- [x] Прогресс-бар в реальном времени (onSnapshot)
- [x] Отмена рендера
- [x] Выбор качества (720p / 1080p / 1440p / 4K)
- [x] Render Presets (автосохранение + загрузка)
- [x] deleteRender (очистка Firestore + R2)
- [x] Idempotency check + multipart upload
- [x] User-friendly error mapping
- [ ] Автоматический upload на YouTube из приложения
- [ ] Batch rendering (несколько видео за раз)
- [ ] Ресерч ускорения рендера (см. ниже)

### Ресерч: ускорение рендера

| Опция | Суть | Потенциал | Сложность | Стоимость |
|-------|------|-----------|-----------|-----------|
| **GPU encoding (NVENC)** | Cloud Run с NVIDIA L4 GPU → аппаратный кодировщик H.264 вместо CPU libx264 | 10-50x быстрее encoding | Средняя (Dockerfile + deploy.sh, ffmpeg flags) | ~$0.20-0.40/рендер (GPU instances дороже) |
| **WebCodecs (client-side)** | Рендер прямо в браузере через WebCodecs API — без сервера | Ноль серверных затрат | Высокая (новый encoder, browser compatibility) | $0 |
| **Pre-encode audio** | Кодировать аудио при upload трека, при рендере только mux видео + готовый аудио | Быстрее этап encoding для повторных рендеров | Низкая | Минимальная |
| **Remotion / Shotstack** | Сторонний rendering API — делегируем encoding | Нет инфраструктуры, масштабирование из коробки | Средняя (интеграция API) | $0.05-0.50/мин видео |
| **Segment-based parallelism** | Разбить аудио на сегменты, рендерить параллельно, склеить | 2-4x быстрее на длинных видео | Высокая (split + concat pipeline) | Та же |

> Текущий preset `veryfast` + `-tune stillimage` + 6fps уже оптимален для статических обложек. Основное время — encoding длинного аудио в AAC и muxing. GPU (NVENC) даст наибольший ROI для тяжелых рендеров (4K, длинные видео).

### Stage Final: Market-Ready Vision

- **Upload на YouTube**: после рендера — кнопка "Upload to YouTube" (YouTube Data API v3, OAuth, выбор канала, title/description/tags из video metadata). Пользователь не покидает приложение.
- **Batch rendering**: очередь из нескольких видео, рендер по одному (или параллельно при масштабировании Cloud Tasks `max-concurrent-dispatches`), уведомление когда все готовы.
- **Ускорение**: GPU encoding (NVENC) для 4K и длинных видео, client-side WebCodecs для простых рендеров (экономия на сервере).

---

## Техническая реализация

### Архитектура (pipeline)

```
Browser → Cloud Function (startRender)
       → Firestore doc (status: "queued")
       → Cloud Tasks queue (render-queue, max 1 concurrent)
       → Cloud Run Job (render-worker, 8 CPU / 8 GB RAM)
          → Download audio + cover from Firebase Storage
          → ffmpeg (H.264 High Profile, AAC 320k, 6fps)
          → Upload MP4 to Cloudflare R2 (single/multipart)
          → Firestore update (status: "complete", downloadUrl)
       → UI receives update via onSnapshot → Download button
```

### Render stages (Firestore `stage` field)

```
initializing → loading_params → downloading → encoding → uploading → finalizing → (complete)
```

### Status flow (Firestore `status` field)

```
queued → rendering → complete
                   → render_failed
                   → cancelled (via cancelRender Cloud Function)
```

### Firestore schema

| Коллекция | Назначение |
|-----------|-----------|
| `users/{uid}/channels/{chId}/videos/{vId}/renders/{rId}` | Документ рендера (status, progress, stage, downloadUrl, expiresAt, params) |
| `users/{uid}/channels/{chId}/renderPresets/{presetId}` | Render presets (tracks, resolution, loopCount, masterVolume, videoTitle) |

### R2 storage

- Key pattern: `renders/{renderId}.mp4`
- Signed URL expiry: 24 часа
- Multipart threshold: 100 MB (100 MB per part)

### Cloud Functions

| Функция | Файл | Назначение |
|---------|------|-----------|
| `startRender` | `functions/src/render/startRender.ts` | Валидация → Firestore doc → Cloud Tasks enqueue |
| `cancelRender` | `functions/src/render/cancelRender.ts` | Ставит `status: "cancelled"` в Firestore |
| `deleteRender` | `functions/src/render/deleteRender.ts` | Удаляет ВСЕ render docs для видео + R2 файлы |

### Cloud Run Job

| Файл | Назначение |
|------|-----------|
| `cloud-run/render/src/index.ts` | Оркестратор: env vars → preflight check → download → ffmpeg → upload → Firestore update → preset creation |
| `cloud-run/render/src/ffmpeg.ts` | Генерация ffmpeg команды (filter_complex, H.264 настройки), spawn процесса, progress parsing |
| `cloud-run/render/src/download.ts` | Скачивание из Firebase Storage и по HTTP URL |
| `cloud-run/render/src/upload.ts` | Upload в R2: single PutObject (<100 MB) или multipart (>=100 MB) |
| `cloud-run/render/src/logger.ts` | Структурированные JSON логи для Cloud Logging |
| `cloud-run/render/deploy.sh` | Скрипт деплоя: Docker build → Artifact Registry → Cloud Run Job → Cloud Tasks queue |

### Frontend

| Файл | Назначение |
|------|-----------|
| `src/core/stores/editing/renderQueueStore.ts` | Zustand store: управление рендер-очередью, onSnapshot подписка, stall detection |
| `src/core/stores/editing/renderPresetsStore.ts` | Zustand store: загрузка/применение/удаление render presets |
| `src/pages/Details/tabs/Editing/components/RenderControls.tsx` | UI: loop counter, resolution picker (inline + dropdown), size estimate, кнопка Render |
| `src/pages/Details/tabs/Editing/components/RenderProgressBar.tsx` | Прогресс-бар на странице видео |
| `src/pages/Details/tabs/Editing/components/RenderPresetsPanel.tsx` | UI панель presets |
| `src/pages/Details/tabs/Editing/services/renderService.ts` | Вызов Cloud Functions из UI + client-side bitrate map |
| `src/features/Render/RenderQueueFAB.tsx` | Глобальный floating индикатор прогресса |
| `src/features/Render/getRenderStageDisplay.tsx` | Shared маппинг stage/status → icon + label + error messages |
| `src/features/Render/useElapsedTimer.ts` | Hook: таймер elapsed time во время рендера |
| `src/components/ui/atoms/RenderStatusBar.tsx` | Атомарная полоска прогресса |

### Deploy

Cloud Run Job:
```bash
cd cloud-run/render && ./deploy.sh
```

Cloud Functions:
```bash
npx firebase deploy --only functions
```

### Связанная документация

- [Operations Guide](operations-guide.md) — первый запуск, мониторинг, стоимость, типичные проблемы
