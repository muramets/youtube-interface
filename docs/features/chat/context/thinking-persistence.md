# Thinking Persistence — Feature Doc

## Текущее состояние

Thinking bubbles (цепочка мыслей модели) **отображаются только в рамках текущей сессии**. После перезагрузки страницы мысли исчезают — остаётся только текст ответа.

Thinking приходит от бэкенда через SSE-события `{ type: "thought", text }`, накапливается в Zustand state (`thinkingText`), а после окончания стрима кешируется в `sessionThinkingCache` (Map в оперативной памяти). В Firestore мысли не записываются.

---

## Зачем это нужно

Пользователь возвращается к беседе через день и хочет понять, **как модель пришла к выводу**. Сейчас он видит только ответ. С персистентностью — раскрывает thinking bubble и видит полную цепочку рассуждений, включая время обдумывания.

---

## Roadmap

### Этап 1 — Inline Persistence ✅ DONE

Thinking сохраняется как поля `thinking` и `thinkingElapsedMs` прямо в документе сообщения в Firestore. При загрузке беседы мысли доступны сразу.

- [x] Расширить `ChatMessage` — два новых опциональных поля
- [x] Frontend: передавать thinking в `persistAiResponse` при сохранении ответа модели
- [x] Backend: накапливать thinking text и включать в stopped-messages при записи в Firestore
- [x] Frontend: при рендере — приоритет Firestore данных, fallback на session cache
- [x] Тесты: персистентность + приоритет отображения

### Этап 2 — Lazy Loading (будущее, если потребуется) ← YOU ARE HERE

Если thinking text станет слишком большим (>50KB регулярно) и начнёт тормозить загрузку бесед, вынести в subcollection `messages/{id}/thinking` с подгрузкой по клику.

- [ ] Миграция в subcollection
- [ ] Lazy fetch при раскрытии ThinkingBubble
- [ ] Backward compatibility: читать и inline, и subcollection

---

## Архитектурные решения

### Почему inline, а не subcollection?
- **Firestore тарифицирует по количеству чтений, не по размеру**. Subcollection = N дополнительных чтений при загрузке. Inline = 0 дополнительных чтений.
- Thinking text обычно 1-20KB — укладывается в лимит документа (1MB) с огромным запасом.
- Inline проще в реализации и не требует дополнительных запросов.

### Два пути сохранения
1. **Нормальный ответ** (complete): frontend накапливает thinking из SSE `thought` events → передаёт в `persistAiResponse` → пишет в Firestore вместе с ответом.
2. **Остановленный ответ** (stopped): backend **накапливает** thinking text в переменной `thinkingAccumulator` + фиксирует `firstThoughtTs` при первом `onThought` callback → пишет stopped message в Firestore с thinking.

### `done` SSE event НЕ расширяется
**Trade-off:** можно было бы включить thinking в `done` event для robustness (если frontend потеряет отдельные `thought` SSE-события). Но:
- Для **complete** ответов frontend уже имеет полный текст из накопленных `thought` events.
- Для **stopped** ответов backend пишет напрямую в Firestore — `done` event не участвует.
- Дублирование 1-50KB thinking text в каждом `done` event — overhead без реальной выгоды.
→ Решение: не менять `done` event. Если потребуется robustness — пересмотреть в Этапе 2.

### Session cache остаётся
Session cache не удаляется — он нужен для мгновенного отображения thinking в текущей сессии (пока Firestore ещё не подтвердил запись). Приоритет: `msg.thinking` (Firestore) > `getSessionThinking(msg.id)` (session cache).

**Eviction:** `sessionThinkingCache` (Map в оперативной памяти) ограничен 50 записями (FIFO — при переполнении удаляется самая старая запись по порядку вставки). При перезагрузке страницы Map обнуляется полностью. После перезагрузки thinking загружается из Firestore — session cache лишь подстраховка для мгновенного отображения до подтверждения записи. На практике 50 записей ≈ 0.5-1MB — незаметно для браузера.

### Порядок: persist → cache
`persistAiResponse` вызывается **до** `cacheSessionThinking`. Причина: `cacheSessionThinking` ищет ID модельного сообщения в `get().messages`, а это сообщение появляется только после persist (через Firestore `onSnapshot`). Timing race не возникает — сообщение приходит через `onSnapshot` уже с `msg.thinking`, поэтому UI сразу отображает thinking из Firestore. Session cache — redundancy fallback.

### `persistAiResponse` → object params
Текущая сигнатура имеет 9 позиционных параметров. Добавление thinking доведёт до 11 — Positional Parameter Explosion. Рефакторим в `persistAiResponse(params: PersistAiResponseParams)`.

### elapsedMs — approximate metric
Frontend считает `Date.now() - session.streamStartMs` (включает network latency, tool calls, retries). Backend считает `Date.now() - firstThoughtTs` (от первого `onThought` callback). Значения расходятся на 1-5 сек — это ожидаемо. `elapsedMs` — approximate, не сравнивается между путями.

**Known behavior:** Gemini может выдавать thinking порционно с паузами (thought chunk → tool call → thought chunk). `firstThoughtTs` захватывает весь span, включая tool execution time. Это корректно — пользователь видит "сколько прошло от начала раздумий до ответа", а не "сколько CPU-времени потрачено на thinking".

---

## Связанные фичи

- [AI Chat](../README.md) — основной feature doc чата
- [Multi-Provider Architecture](../infrastructure/multi-provider.md) — Gemini + Claude thinking
- [Token Transparency](../cost/token-transparency.md) — стоимость thinking tokens

---

## Technical Implementation

### Затронутые файлы

**Типы:**
| Файл | Изменение |
|------|-----------|
| `src/core/types/chat/chat.ts` | `ChatMessage` + `thinking?: string` + `thinkingElapsedMs?: number` |

**Frontend (persistence):**
| Файл | Изменение |
|------|-----------|
| `src/core/stores/chat/slices/sendSlice.ts` | `persistAiResponse` рефакторинг в object params; принимает thinking; `resumeSendFlow` persist → cache (session cache после persist, т.к. message ID доступен только через onSnapshot) |
| `src/core/services/ai/chatService.ts` | Без изменений — `addMessage` использует spread (`...message`), новые поля проходят автоматически. Verification only. |

**Backend (stopped messages):**
| Файл | Изменение |
|------|-----------|
| `functions/src/chat/aiChat.ts` | `thinkingAccumulator` + `firstThoughtTs` в `onThought` callback; включить в stopped message write |

**Frontend (display):**
| Файл | Изменение |
|------|-----------|
| `src/features/Chat/ChatMessageList.tsx` | Приоритет `msg.thinking` > `getSessionThinking()` |

**Не затрагиваются:**
| Файл | Причина |
|------|---------|
| `functions/src/chat/sseWriter.ts` | `done` SSE event не расширяется (см. архитектурные решения) |
| `src/core/types/sseEvents.ts` | Зеркало sseWriter — тоже без изменений |
