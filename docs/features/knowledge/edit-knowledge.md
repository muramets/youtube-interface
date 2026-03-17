# Edit Knowledge (LLM tool)

> LLM может редактировать существующие Knowledge Items — обновлять content, сохранять версии, показывать diff.

## Текущее состояние

Реализовано полностью. LLM может редактировать существующие KI через `editKnowledge` tool call. Backend handler читает старый doc, создаёт version snapshot в `versions/` subcollection (атомарный batch), обновляет main doc, re-resolves video refs. UI Edit модалка тоже создаёт версию при изменении content. Zen Mode показывает dropdown с историей версий и premium split-view DiffViewer (npm `diff` + custom React, line numbers, green/red highlights, theme-aware CSS variables). Conclude prompt обновлён: LLM предпочитает editKnowledge над saveKnowledge когда KI уже существует.

---

## Что это такое

**Аналогия:** Врач может не только создать новую запись в медкарте, но и обновить существующую — дописать результаты, исправить диагноз. `editKnowledge` — это "дописать в существующую запись".

**Зачем:**
- LLM провела новый анализ трафика → хочет дополнить существующий KI, а не создавать дубликат
- Пользователь просит "обнови анализ упаковки, добавь данные за март" → LLM читает старый KI, дополняет, сохраняет
- Каждое изменение сохраняется как версия → можно посмотреть diff, откатить

## User Flow

1. Пользователь: "обнови анализ трафика для видео X" (или LLM решает сама при Memorize)
2. LLM вызывает `listKnowledge` → видит существующий KI
3. LLM вызывает `getKnowledge` → читает полный content
4. LLM вызывает `editKnowledge` с `kiId` + новый `content`
5. Backend: атомарный batch — snapshot старого content в `versions/` + update основного doc
6. В чате: badge "Knowledge Item updated: Traffic Analysis"
7. Пользователь открывает KI → видит обновлённый content
8. В KI карточке: dropdown "Versions" → выбор версии → line-level diff (как в IDE)

## Version History

- Каждое изменение (UI Edit или LLM Edit) создаёт новую версию
- Версии хранятся в subcollection `knowledgeItems/{kiId}/versions/{versionId}`
- Текущая версия — всегда на основном документе (zero extra reads при обычном просмотре)
- Diff: line-level, как в git/IDE — номера строк, green (added) / red (removed)
- Пользователь может удалить любую версию вручную

## Diff UI

Premium IDE-like diff viewer — **только в Zen Mode** (fullscreen). KI card и Edit модалка не показывают diff.

- Zen Mode расширяется при активном diff: `max-w-4xl` → full-width с padding (`inset-4 sm:inset-8`)
- Split view: left = выбранная старая версия, right = текущая
- Line numbers на обоих столбцах
- Green highlight для добавленных строк
- Red highlight для удалённых строк
- Dropdown с версиями в header Zen Mode (timestamp + source label: "LLM edit", "Manual edit", "Original")
- Design tokens: CSS variables для цветов (theme-aware)

---

## Roadmap

- [x] Phase 1: Backend — `editKnowledge` handler + tool definition + shared video ref utility + version subcollection
- [x] Phase 2: Version history UI — `useKnowledgeVersions` hook + version dropdown в Zen Mode
- [x] Phase 3: DiffViewer — npm `diff` + custom premium component (split view, line numbers, green/red)
- [x] Phase 4: UI Edit → version — ручное редактирование тоже создаёт версию
- [x] FINAL: Double review-fix cycle (R1 Architecture 9/9 PASS + R2 Production 10/10 PASS after fixes)

← YOU ARE HERE

---

## Related Features

- [Knowledge Items](./knowledge-items.md) — основная фича KI (create, read, delete)
- [Memory System](../chat/context/memory-system.md) — L4 cross-conversation memory

---

## Technical Implementation

### Firestore Collections

| Path | Content |
|------|---------|
| `users/{uid}/channels/{chId}/knowledgeItems/{kiId}/versions/{versionId}` | Version snapshots (content, title, createdAt, source, model) |

### Backend

| File | Role |
|------|------|
| `shared/knowledgeVersion.ts` | `KnowledgeVersion` interface — SSOT, shared by frontend + backend |
| `functions/src/services/tools/handlers/knowledge/editKnowledge.ts` | Handler: read existing KI, atomic batch (version snapshot + doc update), video ref re-resolution |
| `functions/src/services/tools/utils/resolveContentVideoRefs.ts` | Shared utility: extract video IDs from content, resolve via 3-step resolver, write `resolvedVideoRefs` snapshot |
| `functions/src/services/tools/definitions.ts` | `editKnowledge` tool definition (in `TOOL_DECLARATIONS`, available in chat + memorize) |
| `functions/src/services/tools/executor.ts` | Handler registration |
| `functions/src/chat/aiChat.ts` | Content stripping: `editKnowledge` args.content → `[Updated KI ${id}]` |

### Frontend

| File | Role |
|------|------|
| `src/core/types/knowledge.ts` | Re-exports `KnowledgeVersion`, adds `KnowledgeVersionWithId` |
| `src/core/services/knowledge/knowledgeVersionService.ts` | Version CRUD: getVersions (limit 50, DESC), createVersion, deleteVersion |
| `src/core/services/knowledge/knowledgeService.ts` | `updateKnowledgeItemWithVersion` — wrapper: if content changed → create version → update |
| `src/core/hooks/useKnowledgeVersions.ts` | TanStack Query hook: versions subcollection, 30s staleTime, delete mutation |
| `src/core/hooks/useKnowledgeItems.ts` | `useUpdateKnowledgeItem` — accepts optional `previousItem` for version creation |
| `src/features/Knowledge/components/VersionDropdown.tsx` | Version history dropdown with ARIA, Escape key, delete per version |
| `src/features/Knowledge/components/RenderedDiffViewer.tsx` | Read-only split-view diff: rendered markdown with vid:// tooltips in both columns |
| `src/features/Knowledge/components/LiveDiffPanel.tsx` | Editor side panel: rendered markdown diff (old version), debounced 300ms |
| `src/features/Knowledge/components/KnowledgeViewer.tsx` | Zen Mode: version dropdown, RenderedDiffViewer when version selected, near-fullscreen |
| `src/features/Knowledge/utils/diffUtils.ts` | Shared: `computeDiffBlocks` (diffLines), `allowCustomUrls` |
| `src/features/Knowledge/utils/bodyComponents.tsx` | ReactMarkdown overrides: h1-h6 sizing, vid:// link tooltips, `<ol start>` preservation |
| `src/components/ui/organisms/RichTextEditor/types.ts` | Slot props: `expandedToolbarExtra`, `expandedSidePanel` |
| `src/core/config/concludePrompt.ts` | Conclude instruction: prefer editKnowledge over saveKnowledge for existing KI |
| `src/features/Chat/utils/toolRegistry.ts` | `editKnowledge` badge (BookOpen, emerald) |

### Dependencies

| Package | Purpose |
|---------|---------|
| `diff` | Line-level diff algorithm (~7KB) |

### Architectural Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | `editKnowledge` — отдельный tool, не расширение `saveKnowledge` | SRP: create vs update — разные операции, разные валидации |
| 2 | Versions в subcollection, не массив на документе | Firestore 1MB лимит, lazy loading, удаление одной версии без перезаписи |
| 3 | Текущая версия на основном doc, не в subcollection | Zero extra reads при обычном просмотре (90% use cases) |
| 4 | npm `diff` для алгоритма + custom React для UI | Лёгкая зависимость (7KB), полный контроль над premium дизайном |
| 5 | UI Edit тоже создаёт версию | Единообразие: любое изменение = версия, полная история |
| 6 | Scope Phase 1: только content | Title/summary/category — добавить позже по необходимости |
| 7 | Atomic batch для version + update | Prevents phantom versions при partial failure (version created, doc not updated) |
| 8 | Shared `resolveContentVideoRefs` utility | Extracts 40-line video ref resolution from `saveKnowledge`, shared by both handlers. Eliminates code duplication |
| 9 | Version snapshot includes `title?` | Forward-proofing: title нужен для diff labels, добавить позже без миграции |
| 10 | LLM prefers editKnowledge over saveKnowledge | При Memorize: если KI с тем же category+video уже есть — edit, не create |
