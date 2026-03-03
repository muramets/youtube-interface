# Backlog: UI Component Consolidation

## CsvDropZone → AudioDropZone Migration
**Приоритет:** Low  
**Статус:** Backlog

### Контекст
Создана shared молекула `CsvDropZone` в `ui/molecules/`. Сейчас используется в:
- ✅ `TrafficUploader.tsx` (Suggested Traffic — full mode)
- ✅ `TrafficSourceTab.tsx` (Traffic Sources — empty state)

### Задача
Адаптировать `AudioDropZone.tsx` (Music) для использования общего `DropZone` компонента.

**Файл:** `src/pages/Music/components/upload/AudioDropZone.tsx`

### Отличия от CsvDropZone
- Принимает аудио файлы (.mp3, .wav, .flac и т.д.)
- Grid layout: cover art (120px) + audio drop zone
- Два слота (vocal + instrumental) с состоянием "all filled"
- Cover art — отдельная зона с image preview

### Рекомендация
Извлечь базовый `DropZone` (без file-type специфики) из `CsvDropZone`, а `CsvDropZone` и `AudioDropZone` строить как обёртки над ним.

---

## ~~Shared Infrastructure: hardlinks → production solution~~
**Приоритет:** Medium  
**Статус:** ✅ Done

### Решение (prebuild copy)
- `auth.ts`, `db.ts` — **backend-only**, удалены из `shared/`, живут только в `functions/src/shared/`
- `models.ts` — единственный реально shared файл, source of truth в `shared/models.ts`
- `functions/scripts/copy-shared.mjs` — prebuild скрипт, копирует `models.ts` → `functions/src/shared/`
- `rootDir: "src"` в `functions/tsconfig.json` — fix output structure (`lib/index.js`)
- `functions/.gitignore` — `src/shared/models.ts` автогенерируемый, не коммитится
- Rogue import в `streamChat.ts` исправлен (`../../../../shared/` → `../../config/models.js`)

---

## ~~Rename `thinkingLevel` → `thinkingOptionId` в API контракте~~
**Приоритет:** Low  
**Статус:** ✅ Done

### Контекст
Поле `thinkingLevel` используется в нашем API (frontend → backend) как **option id** из `ModelConfig.thinkingOptions` (e.g. `"auto"`, `"high"`). Но имя совпадает с Gemini API param `thinkingLevel` (enum: `"low"`, `"medium"`, `"high"`), что создаёт путаницу — одно имя, два значения.

### Задача
Переименовать `thinkingLevel` → `thinkingOptionId` во всём API контракте:
- `AiChatRequest.thinkingLevel` → `thinkingOptionId`
- `StreamChatOpts.thinkingLevel` → `thinkingOptionId`
- `aiProxyService.ts`, `aiService.ts`, `chatStore.ts`, `ChatInput.tsx`
- Маппинг в Gemini API params (`thinkingLevel` / `thinkingBudget`) остаётся только в `streamChat.ts`

### Затронутые файлы (~10)
- `functions/src/types.ts`, `functions/src/chat/aiChat.ts`, `functions/src/services/gemini/streamChat.ts`
- `src/core/services/aiProxyService.ts`, `src/core/services/aiService.ts`
- `src/core/stores/chatStore.ts`, `src/features/Chat/ChatInput.tsx`

---

## Streaming Dots пропадают при навигации назад-вперёд
**Приоритет:** Medium  
**Статус:** Backlog  
**Фича:** Chat

### Контекст
`setActiveConversation` в `chatStore.ts` сбрасывает `isStreaming + streamingNonce` при **любом** переключении — даже при возврате в тот же чат. Stream продолжает бежать на сервере, ответ появится через Firestore subscription, но streaming dots пропадают.

### Задача
Не сбрасывать streaming state при возврате в тот же conversation. Отвязать `streamingNonce` от navigation — nonce должен инвалидироваться только при переключении на **другой** conversation или при явном `stopGeneration`.

### Затронутые файлы
- `src/core/stores/chatStore.ts` — `setActiveConversation`, `handleBack`


