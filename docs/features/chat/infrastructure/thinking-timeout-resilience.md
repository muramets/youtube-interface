# Thinking Timeout Resilience — Extended Thinking Stream Protection

## Текущее состояние

**Стадия 1 реализована + архитектурный фикс liveness.** Thinking-aware dynamic timeout защищает extended thinking сессии от преждевременного обрыва. При thinking events таймаут эскалируется 90s → 600s, SSE heartbeat каждые 30s поддерживает соединение, retry блокируется если thinking шёл. При таймауте partial thinking сохраняется как `stopped` message. Cloud Function timeout увеличен до 1200s, client-side timeout адаптивный (120s → 660s при thinking).

**Liveness architecture:** `streamEvent` — единственный детектор жизни стрима (`resetTimer()` на каждый raw API event). `thinking` и `text` хендлеры управляют только timeout policy (escalation/de-escalation). Heartbeat стартует при thinking и работает до конца стрима (не гасится на thinking→text переходе), что покрывает и tool input streaming (`input_json_delta`).

---

## Что это и зачем

Когда Claude думает над сложным запросом (extended thinking, effort=high), он может молчать 3–6+ минут. Текущая архитектура не различает "API умер" и "Claude думает" — оба выглядят как отсутствие чанков. Результат: таймаут → retry → потеря думающих токенов → пользователь видит "Reconnecting" и сброс прогресса.

**Три принципа решения:**

1. **Не ретраить таймаут, если thinking был в процессе.** Retry бессмыслен — новый вызов начнёт думать заново, теряя всё.
2. **Эскалировать таймаут во время thinking.** 90s → 600s (10 мин) пока идут thinking events, обратно на 90s когда начинается текстовый вывод.
3. **Сохранять partial thinking при таймауте.** Если таймаут всё же произошёл — сохранить накопленный thinking как `status: 'stopped'` сообщение.

**Дополнительно:** SSE heartbeat каждые 30s стартует при thinking и работает до конца стрима (предотвращает timeout браузерного EventSource во время thinking silence и tool input streaming).

---

## User Flow

1. Пользователь отправляет сообщение с thinking=high
2. Claude начинает думать, thinking events приходят (видно в UI)
3. Claude уходит в глубокое думание — events прекращаются на минуты
4. **Раньше:** 90s → timeout → retry → потеря → "Reconnecting"
5. **Теперь:** timeout эскалируется до 600s, SSE heartbeat каждые 30s поддерживает соединение
6. Если 600s превышены — thinking сохраняется как `stopped` message, пользователь видит partial результат + может продолжить в следующем сообщении

---

## Roadmap

### Стадия 1 — Thinking-Aware Timeout + Partial Persistence ✅

- [x] Enrich `AiStreamTimeoutError` с `hadThinkingProgress` флагом
- [x] Thinking-aware `isClaudeTransient` (не ретраить если thinking был)
- [x] Динамический таймаут: 90s → 600s (thinking) → 90s (text output)
- [x] Persist partial thinking на таймаут (catch block в `aiChat.ts`)
- [x] Enrich timeout error с `earlyInputTokens` для partial usage
- [x] SSE heartbeat каждые 30s (стартует при thinking, работает до конца стрима)
- [x] Centralized liveness: `streamEvent` = единственный `resetTimer()`, покрывает все event types вкл. `input_json_delta`
- [x] Cloud Function timeout: 540s → 1200s
- [x] Client-side timeout: 120s → adaptive (думающий стрим допускает дольше)
- [x] Тесты для всех новых путей

← YOU ARE HERE

### Стадия 2 — Telemetry & Cost Tracking

- [ ] Логировать thinking timeout events с accumulated cost
- [ ] Метрика: `thinking_timeout_count` per model
- [ ] Dashboard: thinking time distribution per model

---

## Technical Implementation

### Изменяемые файлы

```
functions/src/
  services/
    ai/
      retry.ts                    ← AiStreamTimeoutError + hadThinkingProgress
  services/
    claude/
      streamChat.ts               ← dynamic timeout, heartbeat, thinking state tracking
  chat/
    aiChat.ts                     ← catch block: persist thinking on timeout, partial usage
    sseWriter.ts                  ← SSEHeartbeatEvent type

src/
  core/
    types/
      sseEvents.ts                ← SSEHeartbeatEvent + parseSSEEvent case
    services/
      ai/
        aiProxyService.ts         ← handle heartbeat (reset inactivity timer, no UI effect)
```

### Константы

| Константа | Значение | Файл |
|---|---|---|
| `STREAM_INACTIVITY_TIMEOUT_MS` | 90_000 (unchanged) | `streamChat.ts` |
| `THINKING_INACTIVITY_TIMEOUT_MS` | 600_000 | `streamChat.ts` |
| `HEARTBEAT_INTERVAL_MS` | 30_000 | `streamChat.ts` |
| `timeoutSeconds` | 1200 (was 540) | `aiChat.ts` |
| `STREAM_TIMEOUT_MS` | 120_000 (default) | `aiProxyService.ts` |
| `THINKING_STREAM_TIMEOUT_MS` | 660_000 (600s + 60s buffer) | `aiProxyService.ts` |

---

## Связанные фичи

- [Chat Resilience](./chat-resilience.md) — базовая retry-инфраструктура (Стадия 1)
- [Agentic Architecture](./agentic-architecture.md) — agentic loop, внутри которого живёт timeout
- [Token Transparency](../cost/token-transparency.md) — отображение стоимости (partial usage при timeout)
