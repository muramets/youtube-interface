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
