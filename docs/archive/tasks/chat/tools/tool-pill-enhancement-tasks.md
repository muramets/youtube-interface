# Tool Pill Enhancement — Task Document

> Улучшить Knowledge tool pills (getKnowledge expanded view + dynamic label, video thumbnails в 4 Knowledge pills) и ввести system-wide "empty results" цвет (`muted`) для всех tool pills в AI чате.

## Quick Context Recovery

Если потерян контекст — читать в этом порядке:
1. **Этот файл** (статус + чеклисты + архитектурные решения)
2. `docs/features/knowledge/knowledge-items.md` (Knowledge Items — что такое KI, user flow, tool calls)
3. `src/features/Chat/utils/toolRegistry.ts` (tool registry — SSOT для pill presentation config)
4. `src/features/Chat/components/ToolCallSummary.tsx` (GroupPill — рендеринг pills, color evaluation, expanded content)
5. `src/features/Chat/components/toolStats/RecordComponents.tsx` (SaveKnowledgeRecord, EditKnowledgeRecord, ListKnowledgeStats, SaveMemoryRecord)

### Key Decisions (carry forward)

1. **`color` field становится union: static ToolColor | dynamic function.** `color: ToolColor | ((group: ToolCallGroup) => ToolColor)`. Функция вычисляется в GroupPill при рендере resolved pill. Альтернатива (вычислять в grouping layer) отклонена — цвет = presentation concern, не data concern.

2. **`'muted'` — новый ToolColor для empty results.** `COLOR_CLASSES.muted = 'bg-slate-400/[0.08] text-slate-400'`. Синевато-серый, визуально distinct от stopped state (`bg-white/[0.04] text-text-tertiary`). Не ошибка (красный), не отмена (серый) — это "запрос выполнен, но результатов ноль".

3. **Helper `emptyAwareColor(base, isEmpty)` — DRY для 9 tools.** Возвращает `(group) => isEmpty(group) ? 'muted' : base`. Каждый tool определяет свой predicate `isEmpty`. Helper живёт в `toolRegistry.ts` (не выносим — one consumer).

4. **`videoMap` пробрасывается в StatsComponent и RecordComponent через расширение prop types.** Новый optional prop: `videoMap?: Map<string, VideoPreviewData>`. Не ломает существующие компоненты — prop optional.

5. **Backend: `getKnowledge` возвращает `items[]` alongside `content`.** Массив `{ id, title, category, videoId, scope }` — без content (он в JSON string `content` для LLM). Frontend использует `items[]` для pill label и expanded view. `editKnowledge` — добавить `videoId` в return (data уже прочитана из Firestore, просто не возвращалась).

6. **Thumbnails берутся из `videoMap` (уже доступен в ToolCallSummary).** Zero дополнительных Firestore reads. `videoMap` содержит `thumbnailUrl` для видео, которые уже были загружены в контексте чата. Если videoId нет в videoMap — fallback на placeholder (consistent с video preview list).

7. **9 tools получают dynamic muted color, 8 tools остаются static.** Список: getKnowledge, listKnowledge, browseChannelVideos, browseTrendVideos, findSimilarVideos, searchDatabase, getVideoComments, getNicheSnapshot, listTrendChannels. Остальные: mentionVideo, getMultipleVideoDetails, viewThumbnails, analyzeSuggestedTraffic, analyzeTrafficSources, getChannelOverview, saveKnowledge, editKnowledge, saveMemory.

## Agent Orchestration Strategy

Main context = **executor + orchestrator** (единственный контекст, последовательное выполнение фаз).
Subagents для:
- **Review Gates** — read-only проверки после каждой фазы (fresh eyes, независимый agent)

Задача компактная (6 файлов, ~200 строк изменений), параллелизация внутри фаз минимальна. Subagents для parallel tasks не нужны.

---

## Phase Status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Backend: `getKnowledge` items[] + `editKnowledge` videoId | DONE |
| 2 | Frontend foundation: types, muted color, emptyAwareColor, dynamic color evaluation | DONE |
| 3 | Frontend: Knowledge pill components (GetKnowledgeStats, thumbnails in all 4 KI pills) + listKnowledge labels (Loaded→Listed) | DONE |
| 4 | Frontend: apply dynamic muted color to 9 tools | DONE |
| FINAL | Double review-fix cycle (R1 Architecture + R2 Production Readiness) | DONE |

## Current Test Count

- **Frontend: 638 tests (47 files)** — verified via `npx vitest run --project frontend` (2026-03-22)
- **Backend: 911 tests (62 files)** — verified via `npx vitest run --project functions` (2026-03-22)
- **Total: 1549 tests (109 files)**

---

## Phase 1: Backend — getKnowledge items[] + editKnowledge videoId

**Goal:** Backend возвращает данные, необходимые frontend-у для dynamic label и expanded view Knowledge pills.

### Critical Context

- ⚠️ `getKnowledge.ts` уже собирает массив `items` (строка 49-68) с полными данными (content, summary, model и т.д.), но возвращает его только в `content` как JSON string. Нужно добавить `items[]` с **облегчёнными** полями (id, title, category, videoId, scope) в return object. Массив `items` в JSON `content` остаётся для LLM — frontend читает новый `items[]`.
- ⚠️ При `items.length === 0` — `getKnowledge` уже возвращает `{ content: "No Knowledge Items found...", items: [] }` (строка 77-82). Поле `items: []` уже есть! Но при `items.length > 0` — `items` НЕ возвращается (строка 84-87). Нужно добавить.
- ⚠️ `editKnowledge.ts` — `kiData` уже содержит `videoId` (строка 62, `kiData = kiSnap.data()`), но return objects (строки 76-81 и 128-134) не включают `videoId`. Нужно добавить в оба return-а (unchanged и updated).
- ⚠️ `category` в `editKnowledge` return уже есть (строка 79, 132). `videoId` добавляется по тому же паттерну.

### Tasks

- [ ] **T1.1** — `getKnowledge.ts`: добавить `items[]` в success return
  - Файл: `functions/src/services/tools/handlers/knowledge/getKnowledge.ts`
  - В блоке `return` (строки 84-87), добавить поле `items` с облегчёнными данными:
    ```
    items: items.map(item => ({
        id: item.id,
        title: item.title,
        category: item.category,
        videoId: item.videoId,
        scope: item.scope,
    })),
    ```
  - ⚠️ НЕ менять существующий `content` (JSON string для LLM) и `count` — только добавить `items`

- [ ] **T1.2** — `editKnowledge.ts`: добавить `videoId` в оба return
  - Файл: `functions/src/services/tools/handlers/knowledge/editKnowledge.ts`
  - Строка 76-81 (unchanged return): добавить `videoId: (kiData.videoId as string) || undefined`
  - Строка 128-134 (updated return): добавить `videoId: (kiData.videoId as string) || undefined`
  - ⚠️ Используем `kiData.videoId` (прочитано из Firestore), НЕ из args (editKnowledge не принимает videoId в args)

- [ ] **T1.3** — Тесты для getKnowledge: проверить наличие `items[]`
  - Файл: `functions/src/services/tools/handlers/knowledge/__tests__/getKnowledge.test.ts`
  - Добавить assertions в существующий тест "fetches by IDs (batch read)":
    - `expect(result.items).toHaveLength(1)`
    - `expect(result.items[0]).toEqual({ id: 'ki-1', title: 'Traffic Analysis', category: 'traffic-analysis', videoId: undefined, scope: 'video' })`
  - Новый тест: "items[] contains videoId when present" — mock с `videoId: 'vid-abc'`, проверить `items[0].videoId === 'vid-abc'`
  - Проверить существующий тест "returns empty result when no items found" — `result.items` уже `[]` (должен проходить без изменений)

- [ ] **T1.4** — Тесты для editKnowledge: проверить наличие `videoId`
  - Файл: `functions/src/services/tools/handlers/knowledge/__tests__/editKnowledge.test.ts`
  - Добавить assertion в "creates version snapshot + updates main doc": `expect(result.videoId).toBe('vid-abc')` (mock EXISTING_KI уже содержит `videoId: 'vid-abc'`)
  - Добавить assertion в "skips version snapshot when content is unchanged": `expect(result.videoId).toBe('vid-abc')`
  - Новый тест: "returns undefined videoId when KI has no videoId" — mock без videoId поля

### Parallelization plan

```
T1.1 + T1.2 — PARALLEL (independent backend files)
T1.3 + T1.4 — PARALLEL (independent test files, after T1.1 + T1.2)
```

### Verification

```bash
npx vitest run --project functions    # all backend tests pass (incl. new)
npm run check                         # lint + typecheck + doc links
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 1 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 1

**Prompt:** "Review Phase 1 of Tool Pill Enhancement (backend changes). Read `docs/features/chat/tools/tool-pill-enhancement-tasks.md` for full context. Check:
1. Does `getKnowledge.ts` return `items[]` with exactly 5 fields (id, title, category, videoId, scope) — no content, no summary, no model?
2. Does the existing `content` JSON string remain unchanged (LLM consumption path not broken)?
3. Does `editKnowledge.ts` include `videoId` in BOTH return paths (unchanged + updated)?
4. Is `videoId` sourced from `kiData` (Firestore), not from `args`?
5. Do tests assert the new fields with specific values (not just `toBeDefined`)?
6. Does the empty-result case (`items: []`) still work correctly?
7. Run `npx vitest run --project functions && npm run check`."

Fix all findings before moving to Phase 2.

---

## Phase 2: Frontend Foundation — Types, Muted Color, Dynamic Color Evaluation

**Goal:** Расширить type system toolRegistry для dynamic color + muted, добавить `emptyAwareColor` helper, научить GroupPill вычислять dynamic color.

### Critical Context

- ⚠️ `ToolColor` type (строка 33 toolRegistry.ts) — union literal. Добавление `'muted'` не ломает existing configs (все static `'emerald'` / `'indigo'` / etc).
- ⚠️ `color` field в `ToolConfig` (строка 46) — сейчас `ToolColor`. Меняем на `ToolColor | ((group: ToolCallGroup) => ToolColor)`. Все existing configs static — обратно совместимо.
- ⚠️ В `ToolCallSummary.tsx` строка 81 — `COLOR_CLASSES[config.color]`. После изменения type `config.color` может быть function. Нужно resolve перед lookup в COLOR_CLASSES.
- ⚠️ `StatsComponent` и `RecordComponent` types (строки 50-52) — расширяем prop types чтобы принимать `videoMap`. Все существующие компоненты НЕ используют videoMap — деструктуризация пустая, TypeScript не жалуется на лишний prop.
- ⚠️ `isExpandable` в `toolCallGrouping.ts` (строка 85) — `getKnowledge` имеет `hasExpandableContent: false`. Нужно поменять на `true` и добавить `StatsComponent`.

### Tasks

- [ ] **T2.1** — Расширить types в `toolRegistry.ts`
  - Файл: `src/features/Chat/utils/toolRegistry.ts`
  - `ToolColor`: добавить `| 'muted'` → `'indigo' | 'amber' | 'emerald' | 'accent' | 'muted'`
  - `ToolConfig.color`: изменить тип на `ToolColor | ((group: ToolCallGroup) => ToolColor)`
  - `StatsComponent`: расширить prop type → `React.FC<{ result: Record<string, unknown>; videoMap?: Map<string, VideoPreviewData> }>`
  - `RecordComponent`: расширить prop type → `React.FC<{ record: ToolCallRecord; videoMap?: Map<string, VideoPreviewData> }>`
  - Добавить import `VideoPreviewData` из `'../../Video/types'`
  - ⚠️ `ToolCallGroup` уже импортирован (строка 14)

- [ ] **T2.2** — Добавить `emptyAwareColor` helper в `toolRegistry.ts`
  - Файл: `src/features/Chat/utils/toolRegistry.ts`
  - После секции `// --- Helpers ---` (строка 109):
    ```typescript
    /** Dynamic color factory: returns base color when results present, 'muted' when empty. */
    function emptyAwareColor(
        base: ToolColor,
        isEmpty: (group: ToolCallGroup) => boolean,
    ): (group: ToolCallGroup) => ToolColor {
        return (group) => isEmpty(group) ? 'muted' : base;
    }
    ```
  - ⚠️ Helper не экспортируется — internal to registry, не нужен вне файла

- [ ] **T2.3** — Добавить `muted` в COLOR_CLASSES и resolve dynamic color в `ToolCallSummary.tsx`
  - Файл: `src/features/Chat/components/ToolCallSummary.tsx`
  - В `COLOR_CLASSES` (строка 53-58): добавить `muted: 'bg-slate-400/[0.08] text-slate-400'`
  - В GroupPill (строка 81): заменить `config.color` → resolved color:
    ```typescript
    const resolvedColor = config
        ? (typeof config.color === 'function' ? config.color(group) : config.color)
        : 'emerald';
    const colorClass = COLOR_CLASSES[resolvedColor] ?? COLOR_CLASSES.emerald;
    ```
  - Также обновить ACCENT_BG_CLASS conditional (строка 129): `config?.color === 'accent'` → `resolvedColor === 'accent'`
  - ⚠️ `resolvedColor` вычисляется только когда `group.allResolved === true` (потому что `stateClasses` использует `colorClass` только в resolved branch). Но функция вызывается безусловно — это OK, `group` передаётся с текущим state. Если group не resolved, `colorClass` не используется (loading/error state overrides).

- [ ] **T2.4** — Пробросить `videoMap` в StatsComponent и RecordComponent в `ToolCallSummary.tsx`
  - Файл: `src/features/Chat/components/ToolCallSummary.tsx`
  - Строка 149 (RecordComponent render): добавить `videoMap={videoMap}` prop
  - Строка 152 (StatsComponent render): добавить `videoMap={videoMap}` prop

- [ ] **T2.5** — Тесты: dynamic color evaluation
  - Файл: `src/features/Chat/utils/__tests__/toolCallGrouping.test.ts`
  - Новая секция: "dynamic color resolution"
  - Тест: "emptyAwareColor returns muted when isEmpty returns true" — mock tool config с dynamic color, verify getGroupLabel still works (color не влияет на label)
  - ⚠️ `emptyAwareColor` не экспортируется — тестируем через integration: register tool с dynamic color, проверяем что `getToolConfig` возвращает function color
  - Альтернатива: тестировать через отдельный unit test файл для `toolRegistry.ts`:
    - Create: `src/features/Chat/utils/__tests__/toolRegistry.test.ts`
    - Тесты: `getToolConfig('getKnowledge')?.color` — verify it's a function (Phase 4)
    - Тесты: `getToolConfig('mentionVideo')?.color` — verify it's a string (static)
    - Тест: вызвать dynamic color function с mock group → verify returns 'muted' when empty, 'emerald' when not

### Parallelization plan

```
T2.1 + T2.2 — SEQUENTIAL (T2.2 uses types from T2.1, same file)
T2.3 + T2.4 — SEQUENTIAL (same file, T2.4 depends on type changes from T2.1)
T2.5 — SEQUENTIAL LAST (tests after implementation)
```

### Verification

```bash
npx vitest run --project frontend     # all frontend tests pass
npm run check                         # lint + typecheck
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 2 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 2

**Prompt:** "Review Phase 2 of Tool Pill Enhancement (frontend foundation). Read `docs/features/chat/tools/tool-pill-enhancement-tasks.md` for full context. Check:
1. Is `ToolColor` type properly extended with `'muted'`? Does it remain a union literal (not `string`)?
2. Is `ToolConfig.color` properly typed as `ToolColor | ((group: ToolCallGroup) => ToolColor)`?
3. Does `emptyAwareColor` helper return a function (not evaluate eagerly)?
4. Is COLOR_CLASSES.muted visually distinct from stopped state (`bg-white/[0.04] text-text-tertiary`)? Compare: `bg-slate-400/[0.08] text-slate-400` vs `bg-white/[0.04] text-text-tertiary`.
5. Does GroupPill resolve dynamic color correctly — `typeof config.color === 'function'` check BEFORE COLOR_CLASSES lookup?
6. Does ACCENT_BG_CLASS conditional use `resolvedColor` (not `config?.color`)?
7. Are `videoMap` props passed to both StatsComponent and RecordComponent render sites?
8. Do existing tests still pass without modification? (backward compatibility)
9. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to Phase 3.

---

## Phase 3: Knowledge Pill Components — GetKnowledgeStats + Thumbnails

**Goal:** Создать `GetKnowledgeStats` component, добавить video thumbnails во все 4 Knowledge pill expanded views, обновить `getKnowledge` config в registry.

### Critical Context

- ⚠️ `getKnowledge` сейчас: `hasExpandableContent: false`, нет StatsComponent. После: `hasExpandableContent: true`, StatsComponent = `GetKnowledgeStats`, dynamic label.
- ⚠️ `videoMap` содержит `VideoPreviewData` с `thumbnailUrl`. Нужно resolve `videoId` → `thumbnailUrl`. Для `saveKnowledge` videoId берём из `record.args.videoId`, для `editKnowledge` — из `record.result.videoId` (Phase 1), для `listKnowledge` и `getKnowledge` — из `result.items[].videoId`.
- ⚠️ Thumbnail placeholder pattern уже есть в ToolCallSummary.tsx строки 170-172: `<div className="w-14 h-8 rounded bg-white/[0.06] flex-shrink-0" />`. Reuse тот же паттерн.
- ⚠️ `isExpandable` (toolCallGrouping.ts строка 85) проверяет `group.videoIds.length > 0 || !!config.StatsComponent`. GetKnowledge добавляет StatsComponent — expandable будет true автоматически.
- ⚠️ SaveKnowledgeRecord / EditKnowledgeRecord — `RecordComponent`, НЕ `StatsComponent`. RecordComponent рендерится per-record. videoMap prop уже добавлен в Phase 2 (type), тут используем.
- ⚠️ ListKnowledgeStats — `StatsComponent`, рендерится один раз. videoMap prop уже добавлен в Phase 2.

### Tasks

- [ ] **T3.1** — Создать `GetKnowledgeStats` component
  - Файл: `src/features/Chat/components/toolStats/RecordComponents.tsx` (добавить в тот же файл — knowledge components co-located)
  - Component: `GetKnowledgeStats: React.FC<{ result: Record<string, unknown>; videoMap?: Map<string, VideoPreviewData> }>`
  - Props: `result.items` (массив `{ id, title, category, videoId, scope }`), `result.count`
  - Рендер:
    - Empty case (`!items || items.length === 0`): "No KI found for this criteria" (текст, не ошибка)
    - Non-empty: список items, каждый item = row с:
      - Thumbnail (из `videoMap.get(item.videoId)?.thumbnailUrl` или placeholder) — слева, `w-14 h-8`
      - Category badge (accent uppercase, `text-[9px]`)
      - Title (truncate)
  - ⚠️ Import `VideoPreviewData` из `'../../../../features/Video/types'` — НЕТ, из `'../../Video/types'` (через relative из `toolStats/` → `features/Video/`). Проверить: `src/features/Chat/components/toolStats/` → `../../../../features/Video/types` = `src/features/Video/types`. Нет — `src/features/Chat/components/toolStats/` → `../../../../` = `src/`. Значит `../../../../features/Video/types` — НЕВЕРНО. Правильный путь: из `src/features/Chat/components/toolStats/RecordComponents.tsx` до `src/features/Video/types.ts` = `../../../Video/types`
  - Import `VideoPreviewData` из `'../../../Video/types'`

- [ ] **T3.2** — Добавить thumbnail в `SaveKnowledgeRecord`
  - Файл: `src/features/Chat/components/toolStats/RecordComponents.tsx`
  - Расширить prop type: `{ record: ToolCallRecord; videoMap?: Map<string, VideoPreviewData> }`
  - videoId из `record.args.videoId` (saveKnowledge передаёт videoId в args)
  - Добавить thumbnail img/placeholder перед category badge (внутри `flex items-center gap-2`)
  - ⚠️ videoId может быть undefined (channel-scope KI) — показываем row без thumbnail

- [ ] **T3.3** — Добавить videoId и thumbnail в `EditKnowledgeRecord`
  - Файл: `src/features/Chat/components/toolStats/RecordComponents.tsx`
  - Расширить prop type: `{ record: ToolCallRecord; videoMap?: Map<string, VideoPreviewData> }`
  - videoId из `record.result.videoId` (добавлен в Phase 1)
  - Добавить thumbnail аналогично T3.2

- [ ] **T3.4** — Добавить thumbnail в `ListKnowledgeStats`
  - Файл: `src/features/Chat/components/toolStats/RecordComponents.tsx`
  - Расширить prop type: `{ result: Record<string, unknown>; videoMap?: Map<string, VideoPreviewData> }`
  - Для каждого item: `videoMap?.get(item.videoId)?.thumbnailUrl`
  - Добавить thumbnail перед category badge в item row

- [ ] **T3.5** — Обновить `getKnowledge` config в registry + export GetKnowledgeStats
  - Файл: `src/features/Chat/utils/toolRegistry.ts`
  - Import: `GetKnowledgeStats` из `'../components/toolStats'`
  - Обновить config `getKnowledge`:
    ```typescript
    getKnowledge: {
        icon: BookOpen,
        color: 'emerald',  // Phase 4 поменяет на dynamic
        StatsComponent: GetKnowledgeStats,
        hasExpandableContent: true,
        labels: {
            error: "Couldn't read knowledge",
            loading: 'Reading knowledge...',
            done: (group) => {
                const result = group.records[0]?.result;
                const count = result?.count as number | undefined;
                const items = result?.items as Array<{ title: string }> | undefined;
                if (count == null && !items?.length) return 'Knowledge loaded';
                if (count === 0 || items?.length === 0) return 'No KI found';
                const n = count ?? items?.length ?? 0;
                if (n === 1) {
                    const title = items?.[0]?.title;
                    return title ? `Read KI: "${title}"` : '1 KI loaded';
                }
                return `Read ${n} KI`;
            },
        },
    },
    ```
  - Файл: `src/features/Chat/components/toolStats/index.ts`
  - Добавить export: `export { GetKnowledgeStats } from './RecordComponents';`

- [ ] **T3.6** — Тесты: GetKnowledgeStats + dynamic label
  - Файл: `src/features/Chat/utils/__tests__/toolRegistry.test.ts` (создать или расширить из Phase 2)
  - Тесты для getKnowledge done label:
    - `count: 0, items: []` → 'No KI found'
    - `count: 1, items: [{ title: 'X' }]` → 'Read KI: "X"'
    - `count: 3, items: [...]` → 'Read 3 KI'
    - `result: undefined` (loading) → не вызывается (loading label static)
  - Файл: `src/features/Chat/utils/__tests__/toolCallGrouping.test.ts`
  - Добавить тест для `isExpandable`: getKnowledge group с StatsComponent → `true`

### Parallelization plan

```
T3.1 — SEQUENTIAL FIRST (GetKnowledgeStats — used by T3.5)
T3.2 + T3.3 + T3.4 — PARALLEL (independent component modifications, same file but independent sections)
T3.5 — after T3.1 (registry config depends on component)
T3.6 — SEQUENTIAL LAST (tests after all implementation)
```

### Verification

```bash
npx vitest run --project frontend     # all frontend tests pass (incl. new)
npm run check                         # lint + typecheck
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 3 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 3

**Prompt:** "Review Phase 3 of Tool Pill Enhancement (Knowledge pill components). Read `docs/features/chat/tools/tool-pill-enhancement-tasks.md` for full context. Check:
1. Does `GetKnowledgeStats` render thumbnails from `videoMap` with the same visual pattern as ToolCallSummary video preview list (w-14 h-8, rounded, placeholder div)?
2. Does `getKnowledge` config have `hasExpandableContent: true` and `StatsComponent: GetKnowledgeStats`?
3. Does the dynamic label correctly handle all cases: 0 items → 'No KI found', 1 item → 'Read KI: "title"', N items → 'Read N KI'?
4. Is `GetKnowledgeStats` exported from `toolStats/index.ts`?
5. Do all 4 Knowledge RecordComponents (Save, Edit, List, GetKnowledge) accept `videoMap` prop and use it for thumbnails?
6. Is `videoId` sourced correctly for each component: saveKnowledge from `args.videoId`, editKnowledge from `result.videoId`, listKnowledge/getKnowledge from `items[].videoId`?
7. Are VideoPreviewData imports using correct relative path from `toolStats/` directory?
8. Do labels test cover edge cases (count=0, count=1 with title, count=N)?
9. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to Phase 4.

---

## Phase 4: Apply Dynamic Muted Color to 9 Tools

**Goal:** Применить `emptyAwareColor` к 9 tools, чтобы pills с нулевыми результатами показывали muted (синевато-серый) цвет.

### Critical Context

- ⚠️ Каждый tool имеет свой predicate для "empty". Нужно точно знать структуру `result` каждого tool. Predicates определяются по первому record в group: `group.records[0]?.result`.
- ⚠️ `emptyAwareColor` вычисляется ТОЛЬКО для resolved groups (`group.allResolved === true`). Для loading/error — цвет не используется (loading = blue, error = red).
- ⚠️ Не все tools имеют `count` — некоторые имеют массивы. Predicate должен быть точным для каждого.
- ⚠️ `browseTrendVideos` и `browseChannelVideos` — paginated (последний record = финальные данные). Но для color достаточно `records[0]?.result` — если первая страница пустая, всё пусто.

### Tasks

- [ ] **T4.1** — Применить `emptyAwareColor` к 9 tools в registry
  - Файл: `src/features/Chat/utils/toolRegistry.ts`
  - Заменить `color: 'emerald'` на dynamic color для каждого:

  1. **getKnowledge:** `color: emptyAwareColor('emerald', (g) => { const r = g.records[0]?.result; return r?.count === 0 || (r?.items as unknown[] | undefined)?.length === 0; })`
  2. **listKnowledge:** `color: emptyAwareColor('emerald', (g) => { const r = g.records[0]?.result; return (r?.count as number) === 0 || (r?.items as unknown[] | undefined)?.length === 0; })`
  3. **browseChannelVideos:** `color: emptyAwareColor('emerald', (g) => { const r = g.records[g.records.length - 1]?.result; return (r?.videos as unknown[] | undefined)?.length === 0; })`
  4. **browseTrendVideos:** `color: emptyAwareColor('emerald', (g) => { const r = g.records[g.records.length - 1]?.result; return (r?.totalMatched as number) === 0; })`
  5. **findSimilarVideos:** `color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.similar as unknown[] | undefined)?.length === 0)`
  6. **searchDatabase:** `color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.results as unknown[] | undefined)?.length === 0)`
  7. **getVideoComments:** `color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.fetchedCount as number) === 0)`
  8. **getNicheSnapshot:** `color: emptyAwareColor('emerald', (g) => { const agg = g.records[0]?.result?.aggregates as Record<string, unknown> | undefined; return (agg?.totalVideosInWindow as number) === 0; })`
  9. **listTrendChannels:** `color: emptyAwareColor('emerald', (g) => (g.records[0]?.result?.totalChannels as number) === 0)`

  - ⚠️ Predicates должны возвращать `boolean`, не `boolean | undefined`. Используем `=== 0` (strict), не `!value` (ловит undefined/null).
  - ⚠️ Для tools без result (loading) — `records[0]?.result` = undefined → predicate returns false → color = base. Это правильно: loading pill не должен быть muted.

- [ ] **T4.2** — Тесты: dynamic color для всех 9 tools
  - Файл: `src/features/Chat/utils/__tests__/toolRegistry.test.ts`
  - Для каждого из 9 tools:
    - Verify `getToolConfig(toolName)?.color` is a function (typeof === 'function')
    - Call with mock group where result is empty → returns 'muted'
    - Call with mock group where result has data → returns 'emerald'
  - Verify remaining tools (mentionVideo, getMultipleVideoDetails, etc.) still have static color (typeof === 'string')
  - ⚠️ Mock group needs: `records: [{ name: toolName, args: {}, result: {...} }]`, `allResolved: true`, `hasErrors: false`

### Parallelization plan

```
T4.1 — SEQUENTIAL FIRST (all registry changes)
T4.2 — SEQUENTIAL LAST (tests after implementation)
```

### Verification

```bash
npx vitest run --project frontend     # all frontend tests pass (incl. new)
npx vitest run --project functions    # backend tests still pass (no backend changes)
npm run check                         # lint + typecheck
```

**MANDATORY: Update this file before proceeding:**
- [ ] Mark completed tasks above
- [ ] Update Phase Status table: Phase 4 → DONE
- [ ] Record test count in "Current Test Count" section

### Review Gate 4

**Prompt:** "Review Phase 4 of Tool Pill Enhancement (dynamic muted color for 9 tools). Read `docs/features/chat/tools/tool-pill-enhancement-tasks.md` for full context. Check:
1. Are exactly 9 tools using `emptyAwareColor`? Not more, not less?
2. Is each predicate using strict `=== 0` comparison (not falsy checks)?
3. Does `browseChannelVideos` use `records[records.length - 1]` (last record, paginated)?
4. Does `browseTrendVideos` use `totalMatched` (not `videos.length`) for empty check?
5. Does `getNicheSnapshot` access `aggregates.totalVideosInWindow` (nested path)?
6. Are the remaining 8 tools (mentionVideo, etc.) still using static string color?
7. Do tests cover both empty and non-empty cases for all 9 tools?
8. Does muted color NOT apply during loading state (only resolved)?
9. Run `npx vitest run --project frontend && npm run check`."

Fix all findings before moving to FINAL.

---

## FINAL: Double Review-Fix Cycle

**Goal:** Финальная валидация architecture consistency и production readiness.

### R1: Architecture Review

**Prompt:** "Architecture review of Tool Pill Enhancement feature. Read these files in order:
1. `docs/features/chat/tools/tool-pill-enhancement-tasks.md`
2. `src/features/Chat/utils/toolRegistry.ts`
3. `src/features/Chat/components/ToolCallSummary.tsx`
4. `src/features/Chat/components/toolStats/RecordComponents.tsx`
5. `functions/src/services/tools/handlers/knowledge/getKnowledge.ts`
6. `functions/src/services/tools/handlers/knowledge/editKnowledge.ts`

Check:
1. **SRP:** Does each file have a single responsibility? Is `emptyAwareColor` in the right place (toolRegistry, not ToolCallSummary)?
2. **Type safety:** Are all `as` casts in predicates justified (Firestore result is `Record<string, unknown>`)? Are there any `as any`?
3. **Consistency:** Do all 4 Knowledge components (Save, Edit, List, Get) use the same thumbnail pattern (size, placeholder, rounded)?
4. **Shared utilities:** Is there duplication between the 9 isEmpty predicates that could be extracted?
5. **Color semantics:** Is `'muted'` color only used for empty-results, never for errors or cancelled state?
6. **Backward compatibility:** Would removing `items[]` from getKnowledge response break the LLM? (No — `content` JSON string is unchanged)
7. **Import paths:** Are all relative imports from `RecordComponents.tsx` to `Video/types` correct?
8. **Registry consistency:** Is `getKnowledge` config style consistent with `listKnowledge` config (similar tool, similar pattern)?
9. Run `npx vitest run --project frontend && npx vitest run --project functions && npm run check` — all must pass."

Fix all R1 findings.

### R2: Production Readiness Review

**Prompt:** "Production readiness review of Tool Pill Enhancement feature. Focus on runtime behavior. Read:
1. `src/features/Chat/utils/toolRegistry.ts` — all dynamic color predicates
2. `src/features/Chat/components/ToolCallSummary.tsx` — GroupPill color resolution
3. `src/features/Chat/components/toolStats/RecordComponents.tsx` — all Knowledge components

Check:
1. **Null safety:** What happens when `group.records[0]?.result` is undefined (tool still loading)? Does dynamic color predicate return false (safe default)?
2. **Performance:** Are dynamic color functions cheap? No Firestore reads, no async, no heavy computation?
3. **Edge case — empty videoMap:** What happens when `videoMap` is undefined? Do thumbnail renders gracefully show placeholder?
4. **Edge case — videoId not in videoMap:** What happens when `videoMap.get(videoId)` returns undefined? Placeholder shown?
5. **Edge case — result.items missing:** What if backend doesn't return `items[]` (old cached response before deploy)? Does getKnowledge label fall back gracefully?
6. **Edge case — getKnowledge with 0 count but items array:** What if `count: 0` but `items: [{...}]` (inconsistent)? Does predicate handle this?
7. **Visual regression risk:** Does muted color look acceptable in both light and dark themes? (`slate-400` opacity on both backgrounds)
8. **Memory leak:** Are there any closures in `emptyAwareColor` that could retain large objects?
9. **Test coverage:** Are there tests for: dynamic color with undefined result? Thumbnail fallback? Label with missing items?
10. Run full test suite and verify 0 failures."

Fix all R2 findings.

### Final Verification

```bash
npx vitest run --project frontend     # 0 failed
npx vitest run --project functions    # 0 failed
npm run check                         # 0 errors, 0 warnings
```

**MANDATORY: Update this file after FINAL:**
- [ ] Update Phase Status table: FINAL → DONE
- [ ] Record final test count
- [ ] Update `docs/features/knowledge/knowledge-items.md` if KI pill behavior changed
