# Edit Knowledge (LLM tool)

> LLM может редактировать существующие Knowledge Items — обновлять content, сохранять версии, показывать diff.

## Текущее состояние

Не начато. Сейчас LLM может только создавать новые KI (`saveKnowledge`). Для редактирования — только UI Edit модалка (ручное). LLM не может дополнить, обновить или исправить существующий KI.

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

- [ ] Phase 1: Backend — `editKnowledge` handler + tool definition + shared video ref utility + version subcollection
- [ ] Phase 2: Version history UI — `useKnowledgeVersions` hook + version dropdown в Zen Mode
- [ ] Phase 3: DiffViewer — npm `diff` + custom premium component (split view, line numbers, green/red)
- [ ] Phase 4: UI Edit → version — ручное редактирование тоже создаёт версию

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

### Planned Files

- **Shared utility** (`tools/utils/resolveContentVideoRefs.ts`): extracted video ref resolution (regex + resolve + snapshot), shared by `saveKnowledge` and `editKnowledge`
- **Backend handler** (`knowledge/editKnowledge.ts`): read existing KI, atomic batch (version snapshot + doc update), video ref re-resolution
- **Shared type** (`knowledgeVersion.ts` in `shared/`): `KnowledgeVersion` interface (content, title?, createdAt, source, model?)
- **Tool definition** (`definitions.ts`): `editKnowledge` tool with `kiId` + `content` params
- **Diff component** (`Knowledge/components/DiffViewer.tsx`): premium line-level diff (line numbers, green/red)
- **Versions hook** (`Knowledge/hooks/useKnowledgeVersions.ts`): TanStack Query for versions subcollection

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
