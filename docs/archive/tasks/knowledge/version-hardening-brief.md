# KI Versioning Hardening — Session Brief

> Цель: довести versioning/restore до production-ready качества. Все findings из code review должны быть закрыты или осознанно отложены.

## Quick Context Recovery

1. Этот файл
2. `docs/features/knowledge/edit-knowledge.md` — feature doc
3. `src/features/Knowledge/modals/KnowledgeItemModal.tsx` — главный оркестратор (restore, save, version selection)
4. `src/core/services/knowledge/knowledgeService.ts` — `updateKnowledgeItemWithVersion` (version snapshot logic)
5. `functions/src/services/tools/handlers/knowledge/editKnowledge.ts` — backend handler

## Research First

**Перед любыми правками** агент ОБЯЗАН провести полный research:

1. Прочитать ВСЕ файлы из секции "Files to review" ниже целиком (не grep, не skim — полное чтение)
2. Прочитать `shared/knowledgeVersion.ts` и `src/core/types/knowledge.ts` — типы, которые нужно обновить
3. Прочитать тесты: `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts`
4. Проверить: есть ли тесты для frontend version logic? Если нет — добавить
5. Запустить `npm run test:run` ДО начала работы — зафиксировать baseline

## Findings to Fix (from elite review)

### CRITICAL — fix first

**#1 — Type contract: lastEditSource/lastEditedBy pass through by accident**
- `useUpdateKnowledgeItem` mutation type (`src/core/hooks/useKnowledgeItems.ts`) не включает `lastEditSource`/`lastEditedBy`
- Они проходят в Firestore через JS spread, но TypeScript contract говорит что их быть не должно
- Fix: добавить в тип мутации. Также добавить в тип `updates` в `useUpdateKnowledgeItem`

**#2 — Type lie: 'chat-edit' missing from source union**
- `shared/knowledgeVersion.ts` — `KnowledgeVersion.source` не включает `'chat-edit'`
- `src/core/types/knowledge.ts` — `KnowledgeItem.lastEditSource` тоже не включает
- Fix: добавить `'chat-edit'` в оба union types

**#3 — Race condition: deleteVersions independent of save**
- `KnowledgeItemModal.tsx` — `onSave()` и `deleteVersions()` — два независимых fire-and-forget mutations
- Если save упадёт, версии всё равно удалятся → data loss
- Fix: вызывать `deleteVersions` в `onSuccess` update мутации, или объединить в один batch

### MEDIUM — fix in same session

**#9 — XSS vector: allowCustomUrls passthrough**
- `src/features/Knowledge/utils/diffUtils.ts` — `allowCustomUrls` пропускает ВСЕ URL без фильтрации
- Fix: allowlist `vid://`, `mention://`, `ki://`, `http://`, `https://`

**#12 — Backend editKnowledge: no content-changed check**
- `functions/src/services/tools/handlers/knowledge/editKnowledge.ts` — всегда создаёт version snapshot, даже если content не изменился
- Frontend (`knowledgeService.ts`) проверяет `contentChanged` — backend нет
- Fix: добавить `if (content.trim() === oldContent.trim()) return early`

**#14 — ESC double-close: dropdown + modal**
- `VersionDropdown.tsx` и `KnowledgeItemModal.tsx` — оба слушают ESC на `document`
- `stopPropagation` между двумя document-level listeners не работает
- Fix: `stopImmediatePropagation` в dropdown, или modal проверяет наличие открытого dropdown

### LOW — fix if time allows

**#7 — Duplicated handleSave in two parents**
- `KnowledgePage.tsx` и `WatchPageKnowledge.tsx` — идентичный callback
- Fix: extract shared hook `useKnowledgeSaveHandler`

**#6 — console.* in editKnowledge backend**
- Pre-existing, not CLAUDE.md compliant
- Fix: migrate to `logger.*`

## Files to Review

| File | What to look for |
|------|-----------------|
| `src/features/Knowledge/modals/KnowledgeItemModal.tsx` | restore flow, handleSave, pendingDeleteIds, restoredVersion |
| `src/features/Knowledge/components/VersionDropdown.tsx` | pendingSet, displayVersions, ESC handler |
| `src/features/Knowledge/components/LiveDiffPanel.tsx` | onRestore prop |
| `src/core/services/knowledge/knowledgeService.ts` | updateKnowledgeItemWithVersion, contentChanged check |
| `src/core/services/knowledge/knowledgeVersionService.ts` | deleteVersions batch |
| `src/core/hooks/useKnowledgeVersions.ts` | deleteVersions mutation |
| `src/core/hooks/useKnowledgeItems.ts` | useUpdateKnowledgeItem — mutation type |
| `src/core/types/knowledge.ts` | KnowledgeItem type, lastEditSource union |
| `shared/knowledgeVersion.ts` | KnowledgeVersion.source union |
| `functions/src/services/tools/handlers/knowledge/editKnowledge.ts` | version snapshot, source, content-changed |
| `src/features/Knowledge/utils/diffUtils.ts` | allowCustomUrls XSS |
| `src/features/Knowledge/utils/formatDate.ts` | getSourceLabel |
| `src/pages/Knowledge/KnowledgePage.tsx` | handleSaveEdit callback |
| `src/features/Watch/components/WatchPageKnowledge.tsx` | handleSave callback |

## Verification

After all fixes:
1. `npm run check` — zero errors
2. `npx vitest run --project frontend` — zero failures
3. `npx vitest run --project functions` — zero failures
4. Update `docs/features/knowledge/edit-knowledge.md` — Technical Implementation + Architectural Decisions
5. Update test count in task doc
