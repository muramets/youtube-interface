# Firebase Data Connect

> Оценка: март 2026 | Статус: **на радаре** (не используется)

## Что это

Firebase Data Connect — managed PostgreSQL (Cloud SQL) с GraphQL-схемой и auto-generated typesafe SDK. Позволяет использовать реляционную БД (таблицы, JOIN, GROUP BY, агрегации) внутри Firebase-проекта. Сосуществует с Firestore — оба сервиса работают в одном проекте, разделяют Firebase Auth.

Анонс: Google I/O, май 2024. SDK на март 2026: v0.5.0 (pre-1.0).

## Релевантность для проекта

### Где может помочь

- **Аналитические дашборды** — сложные агрегации (средние просмотры по категориям, GROUP BY по периодам, percentiles) нативно в SQL вместо pre-computed данных в Cloud Functions
- **Vector search** — pgvector в PostgreSQL вместо отдельной Firestore-коллекции `globalVideoEmbeddings`. Преимущество: комбинация vector search + SQL-фильтры в одном запросе
- **Связи many-to-many** — если появится функционал с перекрёстными запросами (теги ↔ видео ↔ каналы ↔ плейлисты)

### Где НЕ подходит (и почему Firestore остаётся)

- **Real-time** — `onSnapshot` (рендер-пайплайн, чат, синхронизация) не имеет аналога в Data Connect
- **Offline** — Firestore имеет встроенную offline-поддержку, Data Connect — нет
- **Serverless pricing** — Firestore бесплатен при нулевом трафике; Cloud SQL стоит ~$7-10/мес минимум (инстанс работает 24/7)

## Trade-offs vs текущий Firestore

| | Firestore | Data Connect |
|---|---|---|
| Сложные запросы | Ограничены (нет JOIN) | Полный SQL |
| Real-time | onSnapshot | Нет (polling) |
| Offline | Встроенный | Нет |
| Минимальная цена | $0 | ~$7-10/мес |
| Vector search | Отдельная коллекция | Встроенный pgvector |
| SDK зрелость | Стабильный | v0.5.0 (pre-1.0) |

## Когда пересмотреть

- SDK достигнет v1.0 (стабильный API)
- Появится фича с тяжёлой аналитикой / отчётами / дашбордами
- Embedding pipeline потребует рефакторинга (pgvector как замена текущей коллекции)
- Data Connect получит real-time subscriptions (устранит главный недостаток)

## Ключевые технические детали

- **База**: Cloud SQL for PostgreSQL 17
- **Схема**: GraphQL SDL с директивами (`@table`, `@ref`, `@auth`)
- **SDK**: auto-generated для Web, Android, iOS, Flutter, Admin (Node.js)
- **Авторизация**: `@auth` директива с CEL-выражениями (row-level security)
- **Эмулятор**: интегрирован в Firebase Emulator Suite
- **Trial**: Spark plan — 90 дней бесплатно, Blaze — 3 месяца complimentary

## Ссылки

- [Firebase Data Connect docs](https://firebase.google.com/docs/data-connect)
- [Announcing blog post (May 2024)](https://firebase.blog/posts/2024/05/introducing-firebase-data-connect)
- [Pricing](https://firebase.google.com/docs/data-connect/pricing)
