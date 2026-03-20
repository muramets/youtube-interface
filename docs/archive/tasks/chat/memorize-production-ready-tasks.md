# Memorize Production-Ready Refactoring — Task Document

> **Status: COMPLETE.** Archived to `docs/archive/tasks/chat/`.

## Quick Context Recovery

1. **Этот файл** — `docs/archive/tasks/chat/memorize-production-ready-tasks.md`
2. **Feature doc** — `docs/features/knowledge/knowledge-items.md` (секция saveMemory + Memorize flow)
3. **Backend handler** — `functions/src/services/tools/handlers/knowledge/saveMemory.ts`
4. **Tool definitions** — `functions/src/services/tools/definitions.ts`
5. **Frontend UI** — `src/features/Chat/ChatInput.tsx`

---

## Key Decisions (carry forward)

1. **Always-available saveMemory** — tool в `TOOL_DECLARATIONS` всегда. Tool list не меняется → cache breakpoint BP2 стабилен → нет $5 penalty. `CONCLUDE_TOOL_DECLARATIONS` — пустой deprecated export `[]`.

2. **Deterministic doc ID + upsert** — memory doc ID = `conversationId`. `get → exists ? update : set`. Race condition невозможен. 60-секундный idempotency guard удалён.

3. **Full snapshot, не delta** — каждый вызов saveMemory пишет полный контент. LLM имеет весь контекст + предыдущие tool results в истории.

4. **4-state button** — `isMemorizing && isStreaming` показывает Stop. Abort через dual-channel (AbortController + Firestore `abortRequested`).

5. **CONCLUDE_INSTRUCTION переписан** — двухшаговый flow: Step 1 (KI, условный), Step 2 (Memory, всегда). KI не ограничены tool-backed analyses — discussion и strategic decisions тоже. editKnowledge предпочитается для обновления существующих KI.

6. **Tool description** — чёткое разделение memory vs KI. Memory = контекст между сессиями (решения, action items, вопросы). Не содержит внутренних терминов ("conclude flow").

7. **kiRefs удалён** — параметр убран из tool schema и handler. Связь memory→KI уже существует через `ki://` ссылки в content и `conversationId` query. kiRefs был мёртвым полем (не читался downstream).

8. **conversationTitle обновляется при upsert** — берётся из conv doc (orphan guard уже читает его).

9. **KI References section** — добавлена в system prompt (`prompts.ts`) рядом с Video References. `ki://` синтаксис единый во всех промптах.

10. **Backend KI append** — при Memorize дописывает существующие KI чата к промпту с `videoId` для контекста. Формулировка: "use editKnowledge to update".

---

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| P1 | Backend: always-available saveMemory + upsert + KI references | DONE |
| P2 | Frontend: 4-state button fix | DONE |
| P3 | Test updates + cleanup | DONE |
| FINAL | Double review-fix cycle (R1 7/8, R2 9/9) | DONE |
| Post-review | Prompt tuning, kiRefs removal | DONE |

---

## Final Test Count

- **Frontend:** 579 (42 files)
- **Backend:** 873 (61 files)
- **Total:** 1452 (103 files)

Получено запуском `npx vitest run --project frontend` и `npx vitest run --project functions` отдельно (2026-03-20).

---

## Files Changed

| File | Change |
|------|--------|
| `functions/src/services/tools/definitions.ts` | saveMemory → TOOL_DECLARATIONS, description rewrite, kiRefs param removed, CONCLUDE_TOOL_DECLARATIONS emptied |
| `functions/src/services/tools/handlers/knowledge/saveMemory.ts` | Deterministic ID upsert, kiRefs validation removed, 103→73 lines |
| `functions/src/chat/aiChat.ts` | Static `tools: TOOL_DECLARATIONS`, removed CONCLUDE_TOOL_DECLARATIONS import, videoId in KI append |
| `src/features/Chat/ChatInput.tsx` | `isMemorizing && !isStreaming` — 4-state button |
| `src/core/config/prompts.ts` | Added "### Knowledge Item References" section with `ki://` syntax |
| `src/core/config/concludePrompt.ts` | Rewritten: 2-step flow, KI conditional, memory always, `ki://` syntax |
| `functions/src/chat/__tests__/aiChat.conclude.test.ts` | Inverted tests: saveMemory in TOOL_DECLARATIONS, tool list stability |
| `functions/src/services/tools/handlers/knowledge/__tests__/saveMemory.test.ts` | Deterministic ID mocks, kiRefs tests removed, 7 test cases |
| `docs/features/knowledge/knowledge-items.md` | Updated saveMemory and definitions.ts descriptions |
| `docs/backlog.md` | Added #17: channelBasePath extract utility |

---

## Review Results

**R1 Architecture: 7/8 PASS**
- FAIL: `basePath` duplication in 5 handlers — pre-existing tech debt, added to backlog #17.

**R2 Production Readiness: 9/9 PASS**
- Error handling covered by executor.ts try/catch wrapper (line 79-92).
