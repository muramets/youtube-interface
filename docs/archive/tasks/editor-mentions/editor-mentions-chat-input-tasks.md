# @-Mentions в Chat Input (Вариант B: Minimal Tiptap Wrapper) — Tasks

## Overview

Заменить plain `<textarea>` в `ChatInput.tsx` тонким Tiptap-обёрткой, переиспользующей существующие extensions `UnifiedMention` + `VideoRefMark` + `KiRefMark`. Цель: @-mentions в чат-инпуте с табированным dropdown (Videos | Knowledge). Без toolbar, без slash commands, без Zen mode.

**Feature doc:** `docs/features/editor-mentions.md` — READ BEFORE ANY PHASE.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. Этот файл (статус + чеклисты)
2. `docs/features/editor-mentions.md` (архитектура mentions, URI schemes, extensions)
3. `src/features/Chat/ChatInput.tsx` (текущий textarea-based input, 532 строки)
4. `src/components/ui/organisms/RichTextEditor/RichTextEditor.tsx` (полный RTE — что переиспользовать, что НЕ тащить)
5. `src/components/ui/organisms/RichTextEditor/extensions/UnifiedMention.ts` (Suggestion plugin, popup rendering)

### Key Decisions (carry forward)

1. **Variant B — minimal Tiptap wrapper, NOT full RichTextEditor.** Новый компонент `ChatTiptapEditor` создаётся рядом с `ChatInput.tsx`. Переиспользует extensions из `RichTextEditor/extensions/`, но НЕ наследует: toolbar, Zen mode, CollapsableHeadings, SlashCommand, Tables, Details, code extensions. Это ~15% от полного RTE. Альтернатива (встроить полный RTE) отклонена — слишком много ненужного UI/поведения для chat input.

2. **Минимальный набор extensions:**
   - `StarterKit` (only paragraph + text, disable: heading, code, codeBlock, lists, blockquote, horizontalRule)
   - `Placeholder`
   - `VideoRefMark` (semantic mark, MarkView tooltip)
   - `KiRefMark` (semantic mark, MarkView tooltip)
   - `UnifiedMention` (@ trigger + tabbed dropdown)
   - `Document`, `Paragraph`, `Text` через StarterKit
   - НЕ нужны: Color, TextStyle, TextAlign, Table*, CollapsableHeadings, IndentedListItem, TabIndentation, CustomBlockquote, SlashCommand, Details*

3. **Enter=send, Shift+Enter=newline.** Реализуется через Tiptap keyboard shortcut extension (custom, inline). Enter вызывает `onSend`, Shift+Enter вставляет `<br>` (hardBreak). Это переопределяет дефолтное поведение Enter в Tiptap (новый параграф).

4. **Markdown serialization при send.** Содержимое Tiptap сериализуется в markdown через Turndown при отправке. Упрощённый Turndown (без правил для tables, aligned paragraphs, indented lists, details — их нет в chat input). `vid://` и `ki://` ссылки автоматически сохраняются через `renderHTML` marks. Backend получает текст с `[title](vid://ID)` и `[title](ki://ID)` — как и от полного RTE.

5. **File paste/drag остаётся в ChatInput.** Tiptap `handlePaste` и `handleDrop` проксируют файлы в существующий `onAddFiles`. Текстовый paste обрабатывается Tiptap нормально. Бинарный paste (images) перехватывается ПЕРЕД попаданием в Tiptap.

6. **Auto-resize через CSS, не через JS height calculation.** Tiptap-editor использует `min-height` + `max-height` + `overflow-y: auto`. Нет нужды в ручном `scrollHeight` — Tiptap рендерит блочные элементы, height автоматический. Max-height = 80px (как у текущего textarea).

7. **VideoRefContext + KiRefContext оборачивают ChatTiptapEditor.** Для работы tooltip MarkView нужен React Context. Paттерн: `RichTextEditor.tsx` lines 162-164. Maps строятся из `videoCatalog`/`knowledgeCatalog` props.

8. **Visual parity constraint.** Замена касается ТОЛЬКО `<textarea>` → `<EditorContent>`. Action bar (attach, model selector, thinking toggle, context bridge, memorize, send/stop) и container div (border, memorize mode styling) НЕ ЗАТРАГИВАЮТСЯ. JSX action bar остаётся в `ChatInput.tsx` as-is. Агент НЕ должен перемещать action bar внутрь `ChatTiptapEditor`.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (keeps cross-phase context).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)
- **Parallel tasks** — независимые файлы внутри фазы

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Foundation: ChatTiptapEditor component + minimal extensions | DONE |
| 2 | Integration: wire into ChatInput, replace textarea, preserve all behavior | DONE |
| 3 | Context providers + catalog prop threading through ChatPanel | DONE |
| 4 | Tests + edge cases | DONE |
| FINAL | Double review-fix cycle (R1: Architecture, R2: Production Readiness) | DONE |

## Current Test Count

- **Frontend: 562 tests (41 files)** — verified via `npx vitest run --project frontend` (2026-03-19)
- **Backend: 871 tests (61 files)** — verified via `npx vitest run --project functions` (2026-03-19)
- **Total: 1433 tests (102 files)**

---

## Phase 1: Foundation — ChatTiptapEditor Component

**Goal:** Создать minimal Tiptap editor component для chat input с @-mention support и keyboard shortcuts (Enter=send, Shift+Enter=newline).

### Critical Context

- `useEditor` из `@tiptap/react` — основной hook. `EditorContent` — React component для рендера.
- `StarterKit` включает Document, Paragraph, Text, History, HardBreak и кучу ненужного (heading, lists, code...). Нужно отключить всё лишнее через `configure()`.
- `UnifiedMention.configure({ videoCatalog, knowledgeCatalog })` — принимает массивы. ⚠️ **НЕ** добавлять каталоги в `useMemo` deps — Tiptap при изменении `extensions` уничтожает и пересоздаёт editor (destroy/recreate loop → мерцание, потеря фокуса). Каталоги читаются через замыкание `this.options` при каждом keystroke. Extensions инициализировать ОДИН раз.
- `Placeholder.configure({ placeholder })` — для плейсхолдера как в текущем textarea.
- Turndown service нужен упрощённый — из полного RTE (`useTurndownService.ts`) 80% правил не нужны (tables, aligned paragraphs, details, indented lists). Создать отдельный `useChatTurndownService` с минимумом. Turndown дефолтно конвертирует `<a href="vid://ID">` → `[title](vid://ID)` — дополнительные правила для marks не нужны.
- **Popup positioning:** `UnifiedMention` рендерит popup через `document.body.appendChild`. Chat input прибит к **низу экрана** → текущий `positionSuggestionPopup` ставит popup НИЖЕ курсора (`rect.bottom + GAP`) → popup выйдет за viewport. **ОБЯЗАТЕЛЬНО** добавить `direction: 'up'` option в `positionSuggestionPopup` (или создать `positionSuggestionPopupUp`). Без этого фича нерабочая.
- `VideoRefMark` и `KiRefMark` рендерят `ReactMarkViewRenderer` — для tooltip нужны `VideoRefContext` и `KiRefContext` в React tree выше `EditorContent`.

### Tasks

- [x] **T1.1** — Create `useChatEditorExtensions` hook
  - Create: `src/features/Chat/hooks/useChatEditorExtensions.ts`
  - Function: `useChatEditorExtensions(placeholder: string, videoCatalog: VideoPreviewData[], knowledgeCatalog: KiPreviewData[], onSend: () => void): Extension[]`
  - Extensions:
    ```
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      code: false,
      listItem: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      horizontalRule: false,
    })
    Placeholder.configure({ placeholder })
    VideoRefMark
    KiRefMark
    UnifiedMention.configure({ videoCatalog, knowledgeCatalog })
    ChatKeyboardShortcuts (custom inline Extension — see T1.2)
    ```
  - ⚠️ `useMemo` on `[placeholder]` ONLY — НЕ включать `videoCatalog`, `knowledgeCatalog`, `onSend` в deps. Tiptap при изменении `extensions` делает destroy/recreate editor. Каталоги читаются через замыкание `this.options` внутри `UnifiedMention` при каждом keystroke. `onSend` обернуть в `useRef` (callback ref pattern) — extension читает `onSendRef.current`.
  - Pattern: follow `useEditorExtensions.ts` structure but 70% simpler

- [x] **T1.2** — Create `ChatKeyboardShortcuts` extension (inline in T1.1 or separate)
  - Custom Tiptap Extension:
    ```typescript
    const ChatKeyboardShortcuts = Extension.create<{ onSendRef: React.RefObject<(() => void) | null> }>({
      name: 'chatKeyboardShortcuts',
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            // ⚠️ Если UnifiedMention dropdown открыт — Enter выбирает mention, не отправляет.
            // Suggestion plugin обрабатывает Enter через ProseMirror plugin (другой приоритет).
            // Проверяем: если Suggestion активен — пропускаем (return false).
            const suggestionActive = (editor.state as any).__suggestionActive
            // Альтернатива: проверить через DOM наличие popup
            // const popup = document.querySelector('[data-suggestion-popup]')
            if (suggestionActive) return false
            this.options.onSendRef.current?.()
            return true
          },
          'Shift-Enter': ({ editor }) => {
            editor.commands.setHardBreak()
            return true
          },
        }
      },
    })
    ```
  - ⚠️ **Критический edge case:** Enter при открытом @-dropdown НЕ должен вызывать onSend. Tiptap Suggestion plugin перехватывает Enter через ProseMirror plugin (не через `addKeyboardShortcuts`). Порядок обработки зависит от registration order. **Решение:** в Enter handler проверять, активен ли Suggestion popup. Конкретный механизм проверки определить при реализации (shared state flag, DOM query, или plugin state).
  - `onSendRef` (не `onSend`) — callback ref pattern для стабильности (см. T1.1)
  - Enter MUST return `true` to prevent Tiptap from creating a new paragraph
  - Shift+Enter inserts `<br>` via `setHardBreak()` — user sees newline
  - `StarterKit` includes `HardBreak` extension by default — no extra import needed

- [x] **T1.3** — Create `useChatTurndownService` hook
  - Create: `src/features/Chat/hooks/useChatTurndownService.ts`
  - Simplified Turndown for chat: only needs basic markdown conversion
  - Rules to INCLUDE (from `useTurndownService.ts`):
    - `empty-paragraph` rule (preserve whitespace as `&nbsp;`) — may appear if user types multiple enters
  - Rules to SKIP (not needed in chat input):
    - `indented-list-item` (no lists in chat input)
    - `aligned-paragraph` (no text alignment)
    - `colored-blockquote` (no blockquotes)
    - `compact-list-item` (no lists)
    - `details-*` (no details blocks)
    - `keep(['table', ...])` (no tables)
  - Keep: `keep(['span', 'br'])` (spans from marks, br from hardBreak)
  - `useMemo(() => new TurndownService(...), [])`

- [x] **T1.4** — Create `ChatTiptapEditor` component
  - Create: `src/features/Chat/components/ChatTiptapEditor.tsx`
  - Props interface:
    ```typescript
    interface ChatTiptapEditorProps {
      onSend: () => void
      onAddFiles: (files: File[]) => void
      onContentChange: (hasContent: boolean) => void
      placeholder?: string
      disabled?: boolean
      videoCatalog?: VideoPreviewData[]
      knowledgeCatalog?: KiPreviewData[]
      // Imperative handle for parent
      editorRef?: React.RefObject<ChatTiptapEditorHandle | null>
    }

    interface ChatTiptapEditorHandle {
      getMarkdown: () => string
      clearContent: () => void
      setContent: (markdown: string) => void
      focus: () => void
      isEmpty: () => boolean
    }
    ```
  - Implementation:
    1. `const extensions = useChatEditorExtensions(placeholder, videoCatalog, knowledgeCatalog, onSend)`
    2. `const turndownService = useChatTurndownService()`
    3. `const editor = useEditor({ extensions, content: '', editorProps: { attributes: { class: CHAT_EDITOR_CLASSES } } })`
    4. Build `videoMap` and `kiMap` from catalogs (same pattern as `RichTextEditor.tsx` lines 49-68)
    5. Wrap `EditorContent` in `KiRefContext.Provider` + `VideoRefContext.Provider`
    6. Expose imperative handle via `useImperativeHandle`:
       - `getMarkdown()`: `turndownService.turndown(editor.getHTML())`
       - `clearContent()`: `editor.commands.clearContent()`
       - `setContent(md)`: `editor.commands.setContent(parseMarkdownToHTML(md))`
       - `focus()`: `editor.commands.focus()`
       - `isEmpty()`: `editor.isEmpty`
    7. CSS classes: no prose, no min-height large — match textarea look:
       ```
       CHAT_EDITOR_CLASSES = 'focus:outline-none text-[13px] leading-snug text-text-primary caret-text-secondary font-[inherit]'
       ```
  - File paste handler via `editorProps.handlePaste`:
    ```typescript
    handlePaste: (view, event) => {
      const items = event.clipboardData?.items
      if (!items) return false
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        event.preventDefault()
        onAddFiles(files)
        return true // handled
      }
      return false // let Tiptap handle text paste
    }
    ```
  - File drop handler via `editorProps.handleDrop`:
    ```typescript
    handleDrop: (view, event) => {
      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        event.preventDefault()
        onAddFiles(Array.from(files))
        return true
      }
      return false
    }
    ```
  - `onAddFiles` passed as prop (add to interface)
  - Disable editor when `disabled` prop is true via `editor.setEditable(!disabled)` in `useEffect`
  - **Suggestion popup direction:** ⚠️ **БЛОКИРУЮЩАЯ ЗАДАЧА.** `UnifiedMention` вызывает `positionSuggestionPopup` который ставит popup НИЖЕ курсора (`rect.bottom + GAP`). Chat input внизу экрана → popup за viewport = нерабочий UX. **Решение:** добавить `direction: 'up' | 'down'` param в `positionSuggestionPopup` (файл `src/components/ui/organisms/RichTextEditor/utils/positionSuggestionPopup.ts`). При `direction: 'up'`: `top = rect.top - popupHeight - GAP`. Передавать direction через `UnifiedMention` options. Существующие RTE-users не затронуты (default = 'down').

- [x] **T1.5** — Add `direction` param to `positionSuggestionPopup`
  - File: `src/components/ui/organisms/RichTextEditor/utils/positionSuggestionPopup.ts`
  - Add optional param `direction: 'up' | 'down' = 'down'`
  - When `'down'` (default): existing behavior (`top = rect.bottom + GAP`)
  - When `'up'`: `top = rect.top - rendererElement.offsetHeight - GAP`, clamped to `VIEWPORT_MARGIN`
  - File: `src/components/ui/organisms/RichTextEditor/extensions/UnifiedMention.ts`
  - Add `popupDirection?: 'up' | 'down'` to `UnifiedMentionOptions`
  - Pass `direction` through to `positionSuggestionPopup` calls in `onStart`/`onUpdate`
  - Default `'down'` — existing RTE behavior unchanged
  - `useChatEditorExtensions` passes `popupDirection: 'up'`

### Parallelization Plan

```
T1.1 + T1.2 — PARALLEL (extensions + keyboard shortcuts, can be same file)
T1.3 — PARALLEL with T1.1/T1.2 (turndown — independent utility)
T1.5 — PARALLEL with T1.1/T1.2/T1.3 (popup positioning — independent utility)
T1.4 — SEQUENTIAL LAST (depends on T1.1, T1.2, T1.3, T1.5)
```

### Verification

```bash
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 1 -> DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of editor-mentions-chat-input (foundation). Read `docs/features/editor-mentions.md` for full context. Check:
1. Does `useChatEditorExtensions` disable ALL unnecessary StarterKit features (heading, code, codeBlock, lists, blockquote, horizontalRule)?
2. Does `ChatKeyboardShortcuts` return `true` from Enter handler (preventing Tiptap default)?
3. Does Shift+Enter correctly insert a hardBreak (not a new paragraph)?
4. Does `ChatTiptapEditor` expose `getMarkdown()` via imperative handle? Does it use Turndown (not `editor.getText()`)?
5. Are `VideoRefContext` and `KiRefContext` providers wrapping `EditorContent`? Are videoMap/kiMap built from catalogs correctly (same pattern as `RichTextEditor.tsx` lines 49-68)?
6. Does `handlePaste` intercept file pastes BEFORE Tiptap processes them? Does it return `true` for files, `false` for text?
7. Does `handleDrop` intercept file drops?
8. Is `useChatTurndownService` simplified (no table/list/details rules)?
9. Is there a `parseMarkdownToHTML` call in `setContent` for edit mode initialization?
10. Does `positionSuggestionPopup` support `direction: 'up'`? Does chat's `UnifiedMention` pass `popupDirection: 'up'`?
11. Does Enter handler in `ChatKeyboardShortcuts` check if Suggestion popup is active before calling `onSend`?
12. Does `ChatTiptapEditorProps` include `onAddFiles` and `onContentChange` callbacks?
13. Are `videoCatalog`/`knowledgeCatalog` NOT in `useMemo` deps for extensions (to avoid Tiptap destroy/recreate)?
14. Run `npm run check`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Integration — Replace Textarea in ChatInput

**Goal:** Заменить `<textarea>` на `ChatTiptapEditor` в `ChatInput.tsx`, сохранив все существующие behaviors: send, edit mode, memorize mode, auto-resize, disable.

### Critical Context

- `ChatInput.tsx` (532 строки) — комплексный компонент с множеством state. Textarea управляется через `text` state + `setText`. Новый Tiptap editor НЕ использует controlled `value` — содержимое внутри editor, извлекается при send через `getMarkdown()`.
- **Send flow:** `handleSend` берёт `text.trim()`, если не пусто — вызывает `onSend(text, attachments)`. С Tiptap: `editorRef.current.getMarkdown().trim()`.
- **Edit mode:** `editingMessage` prop → textarea получает `editingMessage.text`. С Tiptap: `editorRef.current.setContent(editingMessage.text)` при смене editingMessage.
- **Memorize mode:** использует тот же text state. С Tiptap: `editorRef.current.getMarkdown()`.
- **canSend:** `(text.trim() || stagedFiles.length > 0) && !isAnyUploading && !hasUnsupportedFiles`. С Tiptap: track `isEmpty` через `editor.on('update')` → local state.
- **Clear after send:** `setText('')` + reset textarea height. С Tiptap: `editorRef.current.clearContent()`.
- **Focus on edit start:** `textareaRef.current.focus()`. С Tiptap: `editorRef.current.focus()`.
- `console.error` в `handleMemorizeSend` (search for `console.error('[ChatInput] memorize failed:')`) — заменить на `logger.error` (import from `src/core/utils/logger.ts`).
- `handleKeyDown` для textarea: `Enter && !Shift → handleSend`. С Tiptap это уже обработано в `ChatKeyboardShortcuts`.
- `handleTextChange` для auto-resize: не нужен — Tiptap auto-resizes.

### Tasks

- [x] **T2.1** — Refactor ChatInput state management
  - File: `src/features/Chat/ChatInput.tsx`
  - Remove `text` state (`const [text, setText] = useState('')`)
  - Remove `textareaRef` (`const textareaRef = useRef<HTMLTextAreaElement>(null)`)
  - Add `editorRef`: `const editorRef = useRef<ChatTiptapEditorHandle>(null)`
  - Add `editorHasContent` state: `const [editorHasContent, setEditorHasContent] = useState(false)` — tracked via callback from ChatTiptapEditor
  - Update `canSend`: replace `text.trim()` with `editorHasContent`
  - Update `handleSend`:
    ```typescript
    const handleSend = useCallback(() => {
      const markdown = editorRef.current?.getMarkdown()?.trim() ?? ''
      if (!markdown && stagedFiles.length === 0) return
      if (isAnyUploading) return
      // ... rest same, but use `markdown` instead of `text.trim()`
      editorRef.current?.clearContent()
    }, [stagedFiles, isAnyUploading, ...])
    ```
  - Update `handleMemorizeSend`: use `editorRef.current?.getMarkdown()?.trim()` instead of `text.trim()`
  - Update `handleCancelMemorize`: `editorRef.current?.clearContent()` instead of `setText('')`
  - Update `handleCancel` (edit cancel): `editorRef.current?.clearContent()`
  - Remove `handleKeyDown` (Enter handling moved to Tiptap extension)
  - Remove `handleTextChange` (auto-resize not needed)
  - Remove `handlePaste` (moved to ChatTiptapEditor)

- [x] **T2.2** — Replace textarea JSX with ChatTiptapEditor
  - File: `src/features/Chat/ChatInput.tsx`
  - Replace textarea block (search for `<textarea` in ChatInput JSX):
    ```tsx
    <ChatTiptapEditor
      ref={editorRef}
      onSend={isMemorizing ? handleMemorizeSend : handleSend}
      onAddFiles={onAddFiles}
      placeholder={isMemorizing ? 'Focus: e.g. "remember our thumbnail strategy"...' : 'Message...'}
      disabled={disabled || isMemorizeSaving}
      videoCatalog={videoCatalog}
      knowledgeCatalog={knowledgeCatalog}
      onContentChange={setEditorHasContent}
    />
    ```
  - Add `onContentChange: (hasContent: boolean) => void` callback to ChatTiptapEditor props — fires on every editor update, used for `canSend` tracking
  - CSS wrapper: keep the same container `<div>` with rounded border styling (`border rounded-xl...`), put ChatTiptapEditor inside with matching padding/sizing

- [x] **T2.3** — Edit mode sync
  - File: `src/features/Chat/ChatInput.tsx`
  - Replace the "sync text with editingMessage" block (search for `editingMessage !== prevEditingRef.current`):
    ```typescript
    if (editingMessage !== prevEditingRef.current) {
      prevEditingRef.current = editingMessage
      if (editingMessage) {
        editorRef.current?.setContent(editingMessage.text)
        requestAnimationFrame(() => editorRef.current?.focus())
      }
    }
    ```
  - Keep `prevEditingRef` pattern (standard "store previous props" during render)
  - `setContent(editingMessage.text)` → parses markdown → sets HTML → marks render correctly
  - Focus after content set needs rAF (same as current textarea focus)

- [x] **T2.4** — Update CSS for Tiptap in chat input container
  - File: `src/features/Chat/ChatInput.tsx` or `src/features/Chat/components/ChatTiptapEditor.tsx`
  - Chat-specific Tiptap styles (no prose, compact):
    ```css
    /* In ChatTiptapEditor or via className */
    .chat-tiptap-editor .ProseMirror {
      min-height: 20px;
      max-height: 80px;
      overflow-y: auto;
      padding: 6px 14px;  /* matches textarea: pt-1.5 pb-2 px-3.5 */
    }
    .chat-tiptap-editor .ProseMirror p {
      margin: 0;  /* no paragraph spacing in chat */
    }
    .chat-tiptap-editor .ProseMirror .is-editor-empty:first-child::before {
      /* Placeholder styling — Tiptap placeholder extension */
      color: var(--text-tertiary);
      float: left;
      height: 0;
      pointer-events: none;
    }
    ```
  - Add CSS rules to `src/index.css` (in a new section "CHAT TIPTAP EDITOR" after KI reference highlight block) — global styles, same pattern as `.video-reference-highlight`
  - ProseMirror paragraph: `margin: 0` critical — without it, each "line" has 1em margin like in blog editor
  - Max-height 80px matches current textarea constraint
  - Video/KI marks: `.video-reference-highlight` and `.ki-reference-highlight` styles already defined globally in `src/index.css` — will work automatically

### Parallelization Plan

```
T2.1 — SEQUENTIAL FIRST (state management refactor — changes prop/callback shape)
T2.2 — SEQUENTIAL after T2.1 (JSX replacement uses new state)
T2.3 — SEQUENTIAL after T2.2 (edit mode depends on editorRef being wired)
T2.4 — PARALLEL with T2.2/T2.3 (CSS independent)
```

### Verification

```bash
npm run check                          # lint + typecheck + doc links
npm run dev                            # manual: open chat, type @vi, verify dropdown, send, edit mode
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 2 -> DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 2

**Prompt:** "Review Phase 2 of editor-mentions-chat-input (integration). Read `src/features/Chat/ChatInput.tsx` and `src/features/Chat/components/ChatTiptapEditor.tsx`. Check:
1. Is `text` state completely removed? No remnants of textarea-based state management?
2. Does `handleSend` use `editorRef.current?.getMarkdown()?.trim()` and then `clearContent()`?
3. Does `canSend` track content via `onContentChange` callback (not by reading editor on every render)?
4. Does edit mode correctly set content from `editingMessage.text` via `setContent(markdown)`? Is focus restored after content set?
5. Does `handlePaste` on Tiptap intercept file pastes and proxy to `onAddFiles`? Does it NOT intercept text pastes?
6. Is the textarea element completely removed from JSX?
7. Is `handleKeyDown` removed from ChatInput (keyboard handling is in Tiptap extension)?
8. Is the memorize mode flow updated to use `getMarkdown()` instead of `text`?
9. Are CSS styles correct: `max-height: 80px`, `overflow-y: auto`, no paragraph margin, placeholder color?
10. Is `console.error('[ChatInput] memorize failed:')` replaced with `logger.error` (from `src/core/utils/logger.ts`)?
11. Is the action bar JSX 100% unchanged (attach, model selector, thinking toggle, context bridge, memorize, send/stop)?
12. Does the container border highlight on focus (`focus-within:border-text-tertiary`) — same as before?
13. Does `CHAT_EDITOR_CLASSES` include `caret-text-secondary` and `font-[inherit]`?
14. Run `npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Context Providers + Catalog Prop Threading

**Goal:** Прокинуть `videoCatalog` и `knowledgeCatalog` из ChatPanel в ChatInput -> ChatTiptapEditor, используя существующие hooks `useVideosCatalog` и `useKnowledgeCatalog`.

### Critical Context

- `ChatPanel.tsx` — orchestrator. Сейчас НЕ вызывает `useVideosCatalog()` и `useKnowledgeCatalog()`. Эти hooks используются в Settings/Knowledge pages.
- `useVideosCatalog()` зависит от `useAuth()` и `useChannelStore()` — оба уже вызываются в `ChatPanel`. Нет дублирования — hook использует `useVideos()` (подписка уже активна) + одноразовый fetch trend videos (cached 90min).
- `useKnowledgeCatalog()` зависит от `useAuth()`, `useChannelStore()`, `useAllKnowledgeItems()` — real-time Firestore subscription. Добавление в ChatPanel = одна новая подписка.
- ChatInput props: нужно добавить `videoCatalog?: VideoPreviewData[]` и `knowledgeCatalog?: KiPreviewData[]`.
- `useVideosCatalog()` и `useKnowledgeCatalog()` должны вызываться ТОЛЬКО когда `view === 'chat'` — иначе лишние подписки в режимах projects/conversations. Решение: вызывать в ChatPanel unconditionally (hooks cannot be conditional), но передавать в ChatInput только когда `view === 'chat'`.
- **TanStack Query dedup:** `useVideosCatalog()` уже вызывается в `MemoryCheckpoint` (child в chat timeline) и `useKnowledgeCatalog()` вызывается в `ChatMessageList`. Добавление в ChatPanel НЕ создаст дублирующих Firestore subscriptions — TanStack Query dedup по queryKey. Новые Firestore `onSnapshot` listeners тоже не создадутся, т.к. subscription `useEffect` в `useAllKnowledgeItems` уже активен из ChatMessageList.

### Tasks

- [x] **T3.1** — Add catalog hooks to ChatPanel
  - File: `src/features/Chat/ChatPanel.tsx`
  - Add imports:
    ```typescript
    import { useVideosCatalog } from '../../core/hooks/useVideosCatalog'
    import { useKnowledgeCatalog } from '../../core/hooks/useKnowledgeCatalog'
    ```
  - Add hook calls (after existing hooks, before return):
    ```typescript
    const videoCatalog = useVideosCatalog()
    const knowledgeCatalog = useKnowledgeCatalog()
    ```
  - Hooks are unconditional (React rules), but data loads only when `userId && channelId` (internal `enabled` guard in useVideosCatalog query)

- [x] **T3.2** — Thread catalogs through ChatInput props
  - File: `src/features/Chat/ChatPanel.tsx`
  - Update ChatInput usage (around line 349-366):
    ```tsx
    <ChatInput
      // ... existing props ...
      videoCatalog={videoCatalog}
      knowledgeCatalog={knowledgeCatalog}
    />
    ```
  - File: `src/features/Chat/ChatInput.tsx`
  - Add to `ChatInputProps`:
    ```typescript
    videoCatalog?: VideoPreviewData[]
    knowledgeCatalog?: KiPreviewData[]
    ```
  - Destructure from props, pass through to `ChatTiptapEditor`

- [x] **T3.3** — Update feature doc
  - File: `docs/features/editor-mentions.md`
  - Update "Где прокинуты mentions" table — add row for Chat Input:
    ```
    | **ChatInput** — сообщения чата | ✅ | ✅ | Chat → Input → @-autocomplete |
    ```
  - Update "Stage 3" roadmap — mark `@-mentions в Chat input` as `[x]` done

### Parallelization Plan

```
T3.1 + T3.2 — SEQUENTIAL (T3.2 depends on T3.1 hooks being available)
T3.3 — PARALLEL with T3.1/T3.2 (doc update independent)
```

### Verification

```bash
npm run check                          # lint + typecheck + doc links
npm run dev                            # manual: open chat, type @, verify suggestions appear with video/KI data
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 3 -> DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 3

**Prompt:** "Review Phase 3 of editor-mentions-chat-input (context providers + catalog threading). Check:
1. Are `useVideosCatalog()` and `useKnowledgeCatalog()` called in ChatPanel (not inside ChatInput)?
2. Are catalogs passed to ChatInput via props? Are props typed with correct `VideoPreviewData[]` and `KiPreviewData[]`?
3. Does ChatInput forward catalogs to ChatTiptapEditor?
4. Is `docs/features/editor-mentions.md` updated with Chat Input in the coverage matrix?
5. Is the Stage 3 roadmap item marked done?
6. Are VideoRefContext and KiRefContext provided inside ChatTiptapEditor (from Phase 1)?
7. Does `useVideosCatalog` query have `staleTime: 90min`? (don't add unnecessary data fetching)
8. Run `npm run check`."

Fix all findings before moving to Phase 4.

---

## Phase 4: Tests + Edge Cases

**Goal:** Тесты для нового ChatTiptapEditor и обновлённого ChatInput. Покрытие: markdown serialization, keyboard shortcuts, file paste proxying, edit mode sync.

### Critical Context

- Tiptap editor в тестах: `@tiptap/react` нуждается в `jsdom` environment. Vitest frontend project уже настроен с `environment: 'jsdom'`.
- Для тестирования Tiptap: создать editor в тесте через `useEditor`, рендерить через `render(<EditorContent editor={editor} />)`.
- Mocking `useVideosCatalog` и `useKnowledgeCatalog` — для integration-level тестов можно mock на уровне module.
- Turndown в тестах: реальный Turndown (не mock), проверять markdown output.
- Existing test files: нет тестов для ChatInput. Создаём с нуля.
- `useChatTurndownService` — unit test на markdown conversion rules.
- `useChatEditorExtensions` — не тестируем напрямую (configuration, не логика).

### Tasks

- [x] **T4.1** — Tests for `useChatTurndownService`
  - Create: `src/features/Chat/hooks/__tests__/useChatTurndownService.test.ts`
  - Cases:
    - Plain text → markdown (unchanged)
    - Paragraph with `<br>` → markdown with newline
    - Text with videoRef mark HTML (`<a href="vid://ID">title</a>`) → `[title](vid://ID)` in markdown
    - Text with kiRef mark HTML (`<a href="ki://ID">title</a>`) → `[title](ki://ID)` in markdown
    - Empty content → empty string
    - Multiple paragraphs → double newline separated
    - Mixed content: text + video ref + more text → correct markdown
  - Mock targets: none (pure function test)
  - Pattern: direct Turndown service test — `const service = renderHook(() => useChatTurndownService()).result.current; expect(service.turndown(html)).toBe(expected)`

- [x] **T4.2** — Tests for `ChatTiptapEditor` imperative handle
  - Create: `src/features/Chat/components/__tests__/ChatTiptapEditor.test.tsx`
  - Cases:
    - `getMarkdown()` returns plain text when editor has text
    - `getMarkdown()` returns markdown with `[title](vid://ID)` when editor has videoRef marks
    - `clearContent()` empties the editor
    - `setContent(markdown)` sets content from markdown string
    - `isEmpty()` returns true for empty editor
    - `isEmpty()` returns false after text input
    - `focus()` focuses the editor
  - Mock targets: none (real Tiptap editor in jsdom)
  - `renderHook` is not enough — need full `render` with `EditorContent` for marks to initialize

- [x] **T4.3** — Tests for keyboard shortcuts integration
  - Create: `src/features/Chat/components/__tests__/ChatTiptapEditor.test.tsx` (same file as T4.2)
  - Cases:
    - Enter key calls `onSend` callback
    - Shift+Enter inserts newline (hardBreak), does NOT call `onSend`
    - Enter with empty editor still calls `onSend` (guard is in ChatInput, not ChatTiptapEditor)
    - ⚠️ Enter while suggestion dropdown is open does NOT call `onSend` (selects mention instead)
    - Editor is not editable when `disabled=true`
  - Simulate keyboard events via Tiptap's `editor.commands` or RTL `fireEvent.keyDown`

- [x] **T4.4** — Tests for file paste proxy
  - Create: `src/features/Chat/components/__tests__/ChatTiptapEditor.test.tsx` (same file)
  - Cases:
    - Paste event with file items → calls `onAddFiles` with files
    - Paste event with text only → does NOT call `onAddFiles`, text pasted normally
    - Paste event with both text and file → prioritizes file (calls `onAddFiles`, prevents text paste)
  - Mock targets: `onAddFiles` callback (jest.fn())

### Parallelization Plan

```
T4.1 — PARALLEL (turndown tests — independent utility)
T4.2 + T4.3 + T4.4 — SEQUENTIAL (same test file, build on each other)
```

### Verification

```bash
npx vitest run --project frontend     # frontend tests pass
npm run check                          # lint + typecheck
```

**MANDATORY: Update this file before proceeding:**
- [x] Mark completed tasks above
- [x] Update Phase Status table: Phase 4 -> DONE
- [x] Record test count in "Current Test Count" section

### Review Gate 4

**Prompt:** "Review Phase 4 of editor-mentions-chat-input (tests + edge cases). Check:
1. Does `useChatTurndownService.test.ts` verify video ref marks serialize to `[title](vid://ID)` format?
2. Does `useChatTurndownService.test.ts` verify KI ref marks serialize to `[title](ki://ID)` format?
3. Do ChatTiptapEditor tests cover the imperative handle (getMarkdown, clearContent, setContent, isEmpty)?
4. Do keyboard tests verify Enter=send and Shift+Enter=newline?
5. Is there a test for Enter while @-dropdown is open (should NOT call onSend)?
6. Is there a test for disabled state (editor not editable)?
7. Do paste tests verify file paste is intercepted but text paste is not?
8. Are tests using real Tiptap editor (not mocking extensions)?
9. Is test count updated in this file?
10. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to FINAL.

---

## FINAL: Double Review-Fix Cycle

### R1: Architecture Review

Spawn a review agent:

**Prompt:** "Architecture review of editor-mentions-chat-input (@-mentions in Chat via Tiptap wrapper). Read `docs/features/editor-mentions.md`, `src/features/Chat/ChatInput.tsx`, `src/features/Chat/components/ChatTiptapEditor.tsx`, `src/features/Chat/hooks/useChatEditorExtensions.ts`. Check ALL:

1. **Separation of concerns**: Is ChatTiptapEditor purely a Tiptap wrapper (no chat business logic)? Is ChatInput still the orchestrator (send flow, edit mode, staged files)?
2. **Extension minimality**: Does `useChatEditorExtensions` include ONLY the extensions needed? No tables, no collapsable headings, no slash commands?
3. **Reuse**: Are `VideoRefMark`, `KiRefMark`, `UnifiedMention` imported from `RichTextEditor/extensions/` (not duplicated)?
4. **Context providers**: Are `VideoRefContext` and `KiRefContext` correctly provided? Are Maps built from catalog arrays (same pattern as `RichTextEditor.tsx`)?
5. **Turndown consistency**: Does `useChatTurndownService` produce markdown compatible with what backend expects? Are `vid://` and `ki://` links preserved through HTML→markdown conversion?
6. **Imperative handle pattern**: Is `useImperativeHandle` used correctly? Does `getMarkdown()` use Turndown (not `editor.getText()`)? Does `setContent()` use `parseMarkdownToHTML()` for proper mark restoration?
7. **No state leak**: Is the old `text` state completely removed from ChatInput? No dual state (React state + Tiptap content)?
8. **Catalog threading**: Does `useVideosCatalog()` + `useKnowledgeCatalog()` live in ChatPanel (not ChatInput)? Are catalogs prop-threaded, not context-based?
9. **CSS isolation**: Do ChatTiptapEditor styles NOT affect the full RichTextEditor? No global overrides?
10. Run `npx vitest run --project frontend && npm run check`."

Fix all R1 findings.

### R2: Production Readiness Review

Spawn a review agent:

**Prompt:** "Production readiness review of editor-mentions-chat-input. Check ALL:

1. **Enter to send**: Does Enter in empty editor NOT crash? Does Enter with only whitespace NOT send?
2. **Edit mode**: When `editingMessage` changes, does editor content update AND focus correctly? When edit is cancelled, is editor cleared?
3. **Memorize mode**: Does memorize flow correctly read from Tiptap editor (not stale state)?
4. **File paste**: Does pasting an image into the editor proxy to `onAddFiles` and NOT insert the image as inline HTML?
5. **Disabled state**: When `disabled={true}`, is the Tiptap editor non-editable? Are visual cues (opacity, cursor) correct?
6. **@-mention dropdown**: Does dropdown appear after `@` + 2 chars? Does it show videos and KI? Does selection insert correct mark?
7. **Marks in send**: After inserting a video mention, does `getMarkdown()` produce `[title](vid://ID)`? Does this survive the send → backend → display pipeline?
8. **Marks in edit mode**: When editing a message that contains `[title](vid://ID)`, does the mark render with correct highlight and tooltip?
9. **Performance**: Is `useVideosCatalog` cached (staleTime 90min)? Does editor re-render on every keystroke cause performance issues? (UseMemo on extensions, stable callback refs)
10. **Cleanup**: Are there any `console.log`, TODO comments, or debug artifacts?
11. **Accessibility**: Does the editor have appropriate ARIA attributes? Is the placeholder visible?
12. Run all tests: `npx vitest run --project frontend && npx vitest run --project functions && npm run check`."

Fix all R2 findings.

### Final Verification

```bash
npx vitest run --project frontend     # frontend tests pass
npx vitest run --project functions     # backend tests pass (no regressions)
npm run check                          # lint + typecheck + doc links
```

**MANDATORY: Update this file:**
- [x] Update Phase Status table: FINAL -> DONE
- [x] Record final test count
- [x] Update `docs/features/editor-mentions.md`:
  - [x] Coverage matrix includes Chat Input row
  - [x] Stage 3 item `@-mentions в Chat input` marked `[x]`
