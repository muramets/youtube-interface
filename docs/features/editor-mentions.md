# Editor Mentions & Reference System

> Единая система @-mentions и интерактивных ссылок — позволяет упоминать видео и Knowledge Items в любом текстовом поле приложения (RichTextEditor + Chat Input).

## Текущее состояние

Реализовано полностью. `@` + 2 символа открывает tabbed dropdown (SegmentedControl: Videos | Knowledge). Выбор видео вставляет `[title](vid://ID)` — indigo подсветка + tooltip с превью. Выбор KI вставляет `[title](ki://ID)` — amber подсветка + tooltip с category/summary. Tab-клавиша переключает между режимами, disabled state при отсутствии данных одного типа. Работает в двух контекстах: (1) RichTextEditor — Memory (Settings + Chat timeline), KI modals (Edit/Create), Base Instructions, Project instructions; (2) Chat Input — тонкая Tiptap-обёртка (`ChatTiptapEditor`) с минимальным набором extensions, Enter=send, popup открывается вверх. В read-only режиме (ReactMarkdown) — те же подсветки и tooltip через `bodyComponents`. `ki://` протокол добавлен в `rehype-sanitize` whitelist всех 5 markdown-рендереров.

---

## Что это такое

**Аналогия:** Как @-упоминания в Slack или Notion — набираешь `@`, видишь список, выбираешь — и в тексте появляется интерактивная ссылка. Только здесь ссылки ведут не на людей, а на видео и результаты анализа (Knowledge Items).

**Зачем:**
- Пользователь может связать memories и KI между собой через ссылки в тексте
- LLM видит `ki://ID` в системном промпте через memories — может вызвать tool для получения полного содержимого KI
- Все ссылки интерактивны: hover показывает превью без перехода на другую страницу

## Два типа ссылок

| | Video Reference | KI Reference |
|---|----------------|--------------|
| **URI** | `vid://VIDEO_ID` | `ki://ITEM_ID` |
| **Цвет** | Indigo (`--reference-highlight`) | Amber (`--ki-reference-highlight`) |
| **Tooltip** | Thumbnail + title + views + channel | Category badge + title + summary |
| **Tiptap Mark** | `videoRef` | `kiRef` |
| **CSS class** | `.video-reference-highlight` | `.ki-reference-highlight` |

## User Flow

1. Пользователь печатает `@` в любом RichTextEditor или Chat Input
2. После 2 символов появляется dropdown с SegmentedControl (Videos | Knowledge)
3. По умолчанию активна вкладка Videos — фильтрация по title/videoId
4. Tab-клавиша переключает на Knowledge — фильтрация по title/category
5. Enter или клик — вставляется цветная ссылка с mark
6. В read-only режиме ссылка подсвечена и при наведении показывает tooltip

## Roadmap

### Stage 1: Video @-mentions ✅
- `vid://` URI scheme, VideoRefMark, VideoSuggestionList, @-autocomplete
- Tooltip с thumbnail + метриками
- Backspace удаляет всю ссылку целиком

### Stage 2: KI @-mentions + Unified dropdown ✅
- `ki://` URI scheme, KiRefMark, KiRefContext, KiRefView
- UnifiedMention с SegmentedControl табами
- KiPreviewTooltipContent (shared между edit и read mode)
- `ki://` в rehype-sanitize whitelist всех рендереров
- useKnowledgeCatalog hook, knowledgeCatalog prop threading

### Stage 3: Потенциальные улучшения
- [ ] Linkify KI IDs в существующем тексте (аналог linkifyVideoIds для ki://)
- [x] @-mentions в Chat input (не только в RichTextEditor)
- [ ] Третий тип ссылок (если появится новая сущность)

## Где прокинуты mentions

### Edit mode (RichTextEditor с @-autocomplete)

Компоненты, передающие `videoCatalog` и/или `knowledgeCatalog` в `RichTextEditor`:

| Место | videoCatalog | knowledgeCatalog | Контекст |
|-------|:---:|:---:|----------|
| **AiAssistantSettings** — новая memory | ✅ | ✅ | Settings → AI Memory → Add Memory |
| **AiAssistantSettings** — редактирование memory | ✅ | ✅ | Settings → AI Memory → Edit |
| **MemoryCheckpoint** — редактирование в чате | ✅ | ✅ | Chat timeline → memory → Edit |
| **KnowledgeItemModal** — редактирование KI | ✅ | ✅ | Knowledge Page / Watch Page → Edit KI |
| **CreateKnowledgeItemModal** — создание KI | ✅ | ✅ | Knowledge Page → Create KI |
| **AiAssistantSettings** — Base Instructions | — | — | Settings → Base Instructions (нет каталогов) |
| **ChatInput** — сообщения чата | ✅ | ✅ | Chat → Input → @-autocomplete (Tiptap wrapper) |

### Read mode (markdown rendering с подсветкой + tooltip)

Компоненты, использующие `bodyComponents` или `CollapsibleMarkdownSections` с поддержкой `vid://` и/или `ki://`:

| Место | vid:// | ki:// | Механизм |
|-------|:---:|:---:|----------|
| **AiAssistantSettings** — просмотр memory | ✅ | ✅ | `CollapsibleMarkdownSections` + videoMap + kiMap |
| **MemoryCheckpoint** — просмотр в чате | ✅ | ✅ | `buildBodyComponents(videoMap, 'compact', kiMap)` |
| **KnowledgeCard** — карточка KI | ✅ | — | `buildBodyComponents(videoMap)` — kiMap не прокинут |
| **CollapsibleMarkdownSections** (Zen mode) | ✅ | ✅* | Поддерживает kiMap prop, но не все callers передают |
| **LiveDiffPanel** — версии KI | ✅ | — | `buildBodyComponents(videoMap)` — kiMap не прокинут |
| **RenderedDiffViewer** — diff версий | ✅ | — | `buildBodyComponents(videoMap)` — kiMap не прокинут |
| **MarkdownMessage** — сообщения чата | ✅ | ✅ | `ChatMessageList` custom `a` handler: `mention://` + `vid://` + `ki://` |

**Примечание:** KI mentions в read mode полностью работают в Memory (Settings + Chat). В KnowledgeCard, diff panels и chat messages — `ki://` ссылки пройдут sanitize, но без tooltip (kiMap не передан). Это приемлемо: KI внутри других KI — редкий кейс.

### Data persistence: vid:// vs ki://

| | vid:// (Video) | ki:// (Knowledge Item) |
|---|---|---|
| **Данные для рендера** | `referenceVideoMap` (3 layers) | `referenceKiMap` (полный каталог) |
| **Persistence** | `mentionedVideos` на ChatMessage (Firestore) | Не нужна — каталог всегда загружен |
| **Резон** | Видеокаталог тяжёлый (own + trend channels) — нерационально загружать целиком для рендера | KI каталог лёгкий (десятки записей) — `useKnowledgeCatalog()` в ChatMessageList |

При отправке сообщения с `vid://` упоминанием, `extractMentionedVideos` парсит текст, ищет видео в `videoCatalog` (уже в памяти для @-autocomplete) и сохраняет `VideoPreviewData` в поле `mentionedVideos` на `ChatMessage`. При рендере `referenceVideoMap` читает это поле как Layer 3.

---

## Technical Implementation

### Архитектура: Parallel Extension Pattern

Каждый тип ссылки реализован как параллельный набор файлов с одинаковой структурой:

```
extensions/
├── VideoRefMark.ts     ↔  KiRefMark.ts        # Tiptap semantic mark
├── VideoRefContext.ts   ↔  KiRefContext.ts      # React Context для данных
├── UnifiedMention.ts                            # Единый @-trigger, два источника
components/
├── VideoRefView.tsx     ↔  KiRefView.tsx        # MarkView с tooltip
├── KiPreviewTooltipContent.tsx                  # Shared tooltip content
├── UnifiedSuggestionList.tsx                    # Tabbed dropdown
```

### URI Scheme Regexes (SSOT)

Все regex для URI schemes в одном файле: `src/core/config/referencePatterns.ts`
- `VID_RE` = `/^vid:\/{2,}\s*(.+)$/`
- `MENTION_RE` = `/^mention:\/{2,}\s*(.+)$/`
- `KI_RE` = `/^ki:\/{2,}\s*(.+)$/`

### CSS Variables (Design Tokens)

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--reference-highlight` | `#818cf8` (indigo-400) | `#a5b4fc` (indigo-300) | Video mention text |
| `--ki-reference-highlight` | `#f59e0b` (amber-500) | `#fbbf24` (amber-400) | KI mention text |
| `--settings-dropdown-bg` | `#ffffff` | `#1F1F1F` | Dropdown background |
| `--settings-dropdown-hover` | `#e8e8e8` | `#333333` | Dropdown hover |

### Sanitize Whitelist

`ki://` протокол должен быть в `rehype-sanitize` schema каждого markdown-рендерера. Текущий список:

| Файл | Роль |
|------|------|
| `CollapsibleMarkdownSections.tsx` | Settings memories, KI viewer (Zen mode) |
| `MemoryCheckpoint.tsx` | Chat timeline memory markers |
| `KnowledgeCard.tsx` | KI list cards |
| `RenderedDiffViewer.tsx` | KI version diff |
| `RichTextViewer.tsx` | Chat message rendering |

### Data Flow: Edit Mode

```
useKnowledgeCatalog() → KiPreviewData[]
  ↓
RichTextEditor prop: knowledgeCatalog
  ↓
useEditorExtensions → UnifiedMention.configure({ knowledgeCatalog })
  ↓
@ trigger → filterItems(query) → UnifiedSuggestionList
  ↓
Selection → insertContent({ marks: [{ type: 'kiRef' }] })
  ↓
KiRefMark → KiRefView (MarkView) → KiRefContext → tooltip
```

### Data Flow: Read Mode

```
markdown: [Title](ki://ID)
  ↓
ReactMarkdown → rehype-sanitize (ki:// allowed) → <a href="ki://ID">
  ↓
bodyComponents.a() → KI_RE.exec(href) → kiMap.get(id)
  ↓
PortalTooltip + KiPreviewTooltipContent
```

### Key Files

| File | Purpose |
|------|---------|
| `src/components/ui/organisms/RichTextEditor/extensions/KiRefMark.ts` | Tiptap Mark for `ki://` links |
| `src/components/ui/organisms/RichTextEditor/extensions/KiRefContext.ts` | React Context for KI data |
| `src/components/ui/organisms/RichTextEditor/extensions/UnifiedMention.ts` | `@` autocomplete: tabbed Videos/Knowledge |
| `src/components/ui/organisms/RichTextEditor/components/KiRefView.tsx` | MarkView: amber highlight + tooltip |
| `src/components/ui/organisms/RichTextEditor/components/KiPreviewTooltipContent.tsx` | Shared tooltip JSX (edit + read) |
| `src/components/ui/organisms/RichTextEditor/components/UnifiedSuggestionList.tsx` | Tabbed dropdown with SegmentedControl |
| `src/components/ui/organisms/RichTextEditor/types.ts` | `KiPreviewData` interface |
| `src/core/hooks/useKnowledgeCatalog.ts` | KI catalog hook (maps KnowledgeItem → KiPreviewData) |
| `src/core/config/referencePatterns.ts` | `VID_RE`, `MENTION_RE`, `KI_RE` (SSOT) |
| `src/features/Knowledge/utils/bodyComponents.tsx` | Read-mode markdown link handler (vid + ki) |
| `src/components/ui/organisms/RichTextEditor/__tests__/kiRefMark.test.ts` | KiRefMark HTML roundtrip tests (11 tests) |
| `src/components/ui/organisms/RichTextEditor/utils/catalogMaps.ts` | Shared `buildCatalogVideoMap` / `buildCatalogKiMap` |
| `src/components/ui/organisms/RichTextEditor/utils/baseTurndownService.ts` | Shared Turndown factory (base rules for all editors) |
| `src/features/Chat/components/ChatTiptapEditor.tsx` | Minimal Tiptap wrapper for Chat Input |
| `src/features/Chat/hooks/useChatEditorExtensions.ts` | Chat-specific extensions (StarterKit minimal + mentions + Enter-to-send) |
| `src/features/Chat/hooks/useChatTurndownService.ts` | Chat Turndown (base factory, no extra rules) |
| `src/features/Chat/utils/extractMentionedVideos.ts` | Parse `vid://` from text + resolve from videoCatalog at send time |
