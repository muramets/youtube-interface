# Render Pipeline — Operations Guide

> Руководство по первому запуску, мониторингу, стоимости и типичным проблемам.
> Техническая архитектура и roadmap — в [README.md](README.md).

---

## Как работает рендер (простым языком)

Когда пользователь нажимает **Render** — видео рендерится **на сервере Google Cloud**, а не на его компьютере.

Представь это как конвейер:

1. **Секретарь** (Cloud Function) — принимает заявку и кладёт её в стопку
2. **Очередь в банке** (Cloud Tasks) — номерки раздали, ждём вызова. Если 10 пользователей нажмут Render одновременно — задачи встанут в очередь
3. **Работник на смену** (Cloud Run Job) — мощная машина (8 CPU, 8 GB RAM), которую нанимают на одну задачу. Сделал — уволился. В отличие от Cloud Functions (умирают через 9 минут), может работать часами
4. **Станок** (ffmpeg) — бесплатная программа для сборки видео. То же самое, что DaVinci Resolve, только в командной строке
5. **Склад** (Cloudflare R2) — хранит готовые файлы. Download бесплатный (в отличие от Firebase Storage)

---

## Первый запуск

### Что нужно установить

1. **Google Cloud CLI** — https://cloud.google.com/sdk/docs/install
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop/

### Шаг 1: Авторизация

```bash
gcloud auth login
```

Откроется браузер — войди в аккаунт Google, привязанный к проекту `mytube-46104`.

### Шаг 2: Деплой Cloud Run Job

```bash
cd cloud-run/render
./deploy.sh
```

Скрипт автоматически:
- Установит активный Google Cloud project
- Включит нужные API
- Создаст Docker registry (Artifact Registry)
- Соберёт Docker image
- Загрузит его в облако
- Создаст Cloud Run Job с правильными настройками
- Создаст очередь Cloud Tasks

**Время:** ~3-5 минут (основное — сборка Docker image).

### Шаг 3: Деплой Cloud Functions

```bash
cd ../..   # вернуться в корень проекта
npx firebase deploy --only functions
```

### Шаг 4: Проверка

Открой приложение — добавь треки — нажми Render — следи за прогрессом.

---

## Мониторинг

### Где смотреть логи

#### Cloud Run Job логи (что делает рендер)

1. Открой [Cloud Run Jobs](https://console.cloud.google.com/run/jobs?project=mytube-46104)
2. Нажми на `render-worker`
3. Вкладка **Executions** — история запусков
4. Нажми на конкретный запуск — **Logs** — полный лог рендера

Логи структурированные (JSON), ключевые поля:
- `step: "start"` — начало
- `step: "download_complete"` — файлы скачены
- `step: "ffmpeg_start"` — ffmpeg запущен
- `step: "ffmpeg_diag"` — диагностика (speed, fps, bitrate — каждые 30 сек)
- `step: "upload_complete"` — загружено в R2
- `step: "preset_created"` — preset автосохранён
- `step: "complete"` — всё готово
- `step: "failed"` — ошибка (смотри `message`)
- `step: "cancelled_cleanup"` — рендер отменён пользователем

#### Cloud Functions логи

1. [Cloud Functions](https://console.cloud.google.com/functions?project=mytube-46104)
2. Или Firebase Console — Functions — Logs

#### Cloud Tasks (очередь)

1. [Cloud Tasks](https://console.cloud.google.com/cloudtasks?project=mytube-46104)
2. Очередь `render-queue` — видно pending/running задачи

### Загрузка CPU/RAM

#### Вариант 1: Cloud Run — Metrics (в реальном времени)

1. [Cloud Run Jobs](https://console.cloud.google.com/run/jobs?project=mytube-46104) — `render-worker` — **Metrics**
2. Графики: CPU utilization, Memory utilization, Startup latency
3. Обновляются с задержкой ~1 минуту

#### Вариант 2: Cloud Monitoring (история и алерты)

1. [Metrics Explorer](https://console.cloud.google.com/monitoring/metrics-explorer?project=mytube-46104)
2. Ресурс: **Cloud Run Job** — `render-worker`
3. Метрики: `container/cpu/utilizations`, `container/memory/utilizations`, `billable_instance_time`

#### Чек-лист: что считается нормой

| Метрика | 1080p (5 мин видео) | 4K (5 мин видео) |
|---------|---------------------|-------------------|
| CPU utilization | 600-800% (из 800% max) | 700-800% |
| Memory | 1-2 GB (из 8 GB) | 3-5 GB |
| Время рендера | ~1-2 мин | ~5-8 мин |
| Cold start | 5-15 сек | 5-15 сек |

---

## Стоимость

### Общий биллинг

[Cloud Console — Billing](https://console.cloud.google.com/billing?project=mytube-46104)

### По сервисам

| Сервис | Что стоит денег |
|--------|----------------|
| **Cloud Run** | CPU + RAM x время работы. ~$0.05-0.10 за рендер |
| **Cloud Tasks** | Первый 1 млн запросов бесплатно |
| **Artifact Registry** | Хранение Docker images. ~$0.10/GB/месяц |
| **Firestore** | Reads/writes. ~$0.001 за рендер |
| **Firebase Storage** | Download bandwidth (скачивание треков сервером) |
| **Cloudflare R2** | Хранение: $0.015/GB/месяц. **Download: $0** |

### Примерная стоимость одного рендера

| Компонент | Стоимость |
|-----------|-----------|
| Cloud Run (8 CPU, 5 мин) | ~$0.04 |
| Firebase Storage download | ~$0.01 |
| R2 storage (24 часа) | ~$0.00 |
| Firestore writes | ~$0.00 |
| **Итого** | **~$0.05** |

---

## Настройки

### Cloud Run Job (`cloud-run/render/deploy.sh`)

| Параметр | Текущее значение | Что меняет |
|----------|-----------------|------------|
| `CPU` | `8` | Количество ядер. Больше = быстрее рендер, дороже |
| `MEMORY` | `8Gi` | RAM. Увеличь если OOM при 4K рендерах |
| `TIMEOUT` | `86400` (24ч) | Максимальное время работы job |
| `MAX_RETRIES` | `2` | Сколько раз retry при ошибке |

### Cloud Tasks queue

| Параметр | Текущее значение | Что меняет |
|----------|-----------------|------------|
| `max-concurrent-dispatches` | `1` | Сколько рендеров одновременно |
| `max-attempts` | `3` | Сколько попыток при ошибке |

Изменение настроек очереди:
```bash
gcloud tasks queues update render-queue \
    --location=us-central1 \
    --max-concurrent-dispatches=2
```

---

## Обновление кода

Изменил код в `cloud-run/render/src/`:
```bash
cd cloud-run/render && ./deploy.sh
```

Изменил Cloud Functions:
```bash
npx firebase deploy --only functions
```

---

## Типичные проблемы

| Симптом | Причина | Решение |
|---------|---------|---------|
| Рендер висит на "Queued" | Cloud Tasks не запускает Job | Проверь очередь в Cloud Console |
| "Failed to start render" | Cloud Function упала | Смотри логи Cloud Functions |
| "Server render failed" | ffmpeg упал или OOM | Смотри логи Cloud Run Job |
| "Video encoding failed" | Невалидные аудио-файлы или обложка | Проверь input файлы |
| "Server ran out of memory" | OOM при 4K + длинное видео | Увеличь `MEMORY` в deploy.sh или снизь quality |
| Кнопка Download не работает | Signed URL протух (>24ч) | Перерендери видео |
| `deploy.sh` падает | Docker не запущен или нет авторизации | Запусти Docker Desktop, `gcloud auth login` |
| "Taking longer than expected" (stalled) | Cloud Run cold start затянулся или сервер перегружен | Подожди — stall detection автоматический, retry при timeout |
