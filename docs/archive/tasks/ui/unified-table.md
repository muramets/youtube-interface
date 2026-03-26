# Unified DataTable — Feature Doc

## Текущее состояние

**Stages 1-5 complete.** Shared DataTable infrastructure в `src/components/ui/organisms/DataTable/`. Две таблицы полностью мигрированы (TrafficSourceTable, TrendsTable), одна получила theme fix без миграции (TrafficTable/TrafficRow). Все ~40 hardcoded dark-only цветов заменены на theme-adaptive Tailwind v4 tokens. 1796 тестов проходят.

### Как таблицы используют DataTable сейчас

| Таблица | Использует DataTable? | Что изменилось |
|---------|:--------------------:|----------------|
| TrafficSourceTable | **Да, полностью** | Column defs + DataTable. 250→160 строк |
| TrendsTable | **Да, с custom renderRow** | HTML `<table>` → CSS Grid DataTable. TrendsVideoRow удалён |
| TrafficTable + TrafficRow | **Нет** | Только theme-aware цвета + inline gridStyle + hover-trail. Слишком специализирован для DataTable (SmartTrafficTooltip, 3 empty states, conditional columns) |

### Что дал рефактор

- **Theme adaptivity** — главная ценность. ~40 hardcoded `bg-white/*`, `text-white/*` → `bg-text-primary/*`, `text-text-primary/*`. Light theme теперь работает
- **DeltaCell unified** — 2 компонента (DeltaCell + DeltaValue, разные цвета) → 1 с compact/full modes
- **Consistent UX** — hover-trail (350ms/75ms) теперь на всех таблицах. Unified delta colors (emerald-500)
- **Infrastructure для будущих таблиц** — новая таблица = column defs + DataTable, всё остальное бесплатно
- **Dead code removed** — TrendsVideoRow.tsx, backlog/unified-table.md

---

## Что это

Shared табличная инфраструктура — generic компонент DataTable + набор cell-компонентов (DeltaCell, ThumbnailCell). Принимает column definitions + data → рисует production-grade таблицу с consistent UX (сортировка, hover-trail, sticky totals, selection glow, виртуализация).

**Два режима использования:**
1. **Полная миграция** (TrafficSourceTable, TrendsTable) — DataTable рендерит всё из column defs
2. **Theme fix** (TrafficTable) — компонент слишком специализирован, но использует те же цветовые tokens и patterns

---

## Как добавить новую таблицу

```tsx
import { DataTable, DeltaCell, useTableSort } from '@/components/ui/organisms/DataTable';
import type { ColumnDef } from '@/components/ui/organisms/DataTable';

interface MyRow { id: string; name: string; value: number; delta: number | null; }

const columns: ColumnDef<MyRow>[] = [
  { key: 'name', header: 'Name', width: '1fr', sortKey: 'name',
    render: (row) => <span className="text-text-primary">{row.name}</span>,
    renderTotal: () => <span>Total</span> },
  { key: 'value', header: 'Value', width: '100px', align: 'right', sortKey: 'value',
    render: (row) => <span className="font-mono">{row.value}</span>,
    renderTotal: () => <span className="font-mono">{totalValue}</span> },
  { key: 'delta', header: 'Change', width: '90px', align: 'right', sortKey: 'delta',
    render: (row) => <DeltaCell delta={row.delta} compact />,
    renderTotal: () => <DeltaCell delta={totalDelta} compact /> },
];

// В компоненте:
const { sortConfig, onSort } = useTableSort({ defaultKey: 'value' });

<DataTable
  columns={columns}
  data={sortedData}
  rowKey={(row) => row.id}
  sortConfig={sortConfig}
  onSort={onSort}
  config={{ showTotalRow: true }}
/>
```

**Для сложных строк** — используй `renderRow` prop (как TrendsTable):
```tsx
<DataTable
  columns={columns}
  data={data}
  rowKey={(row) => row.id}
  renderRow={(item, index, rowProps) => (
    <DataTableRow {...rowProps}>
      {/* Полностью кастомный контент */}
    </DataTableRow>
  )}
/>
```

---

## Roadmap

### Stage 1 — DataTable Infrastructure ✅

Shared DataTable компоненты. Новых CSS variables: 0 — всё через Tailwind v4 opacity modifiers.

- [x] `DataTable.tsx` — generic container: CSS Grid (inline `gridTemplateColumns`), optional TanStack Virtual, sticky header
- [x] `DataTableHeader.tsx` — sortable header cells с sort icons + ghost arrow on hover. `header: ReactNode` для кастомных headers (checkbox)
- [x] `DataTableTotalRow.tsx` — sticky total row, opaque `bg-bg-secondary` + `shadow-xs`
- [x] `DataTableRow.tsx` — base row: hover-trail (350ms/75ms dual-speed), alternating bg (`bg-text-primary/[0.03]`), selection glow
- [x] `DeltaCell.tsx` — unified delta: compact mode (ex-DeltaValue) + full mode (ex-TrafficSourceTable DeltaCell). Dual-speed color transitions
- [x] `ThumbnailCell.tsx` — thumbnail with hover effects, lazy load pulse, now-playing bars
- [x] `useTableSort.ts` — generic sort hook (key + direction + toggle)
- [x] `types.ts` — `ColumnDef<T>`, `SortConfig`, `DataTableConfig`, `DataTableProps`, `DataTableRowProps`
- ~~CSS variables для таблиц~~ — не нужны: Tailwind v4 `bg-text-primary/5` автоматически адаптируется к теме
- ~~backdrop-blur на total row~~ — невозможен (см. Technical Implementation → Backdrop-blur)

### Stage 2 — Migrate TrafficSourceTable ✅

Полная миграция. 250 строк → 160 строк thin wrapper с column defs.

- [x] 6 column definitions (source, impressions, CTR, views, AVD, watchTime)
- [x] DataTable + column defs, `useTableSort` для sort state
- [x] DeltaCell воспроизводит точное поведение (dual-speed transition, original value, pct)
- [x] Старый код удалён (inline DeltaCell, renderHeaderCell, gridCols, manual sort)
- [x] API не изменился — consumer (TrafficSourceTab) работает без изменений

### Stage 3 — Migrate TrendsTable ✅

HTML `<table>` → DataTable CSS Grid. TrendsVideoRow удалён.

- [x] Column definitions для video mode (7 колонок) и channel mode (6 колонок)
- [x] HTML `<table>` → DataTable с inline gridStyle
- [x] DeltaValue (green-400) → DeltaCell compact (emerald-500/60) — unified colors
- [x] Video/channel rows через custom `renderRow` + `DataTableRow`
- [x] Header checkbox через `ColumnDef.header: ReactNode`
- [x] `TrendsVideoRow.tsx` удалён
- [x] TrendsHeader: `border-b` условный — только в timeline mode

### Stage 4 — Theme-fix TrafficTable + TrafficRow ✅

Не мигрировали в DataTable — слишком специализирован. Theme-aware цвета + unified patterns.

- [x] `gridClassName` (4 статических Tailwind комбинации) → `gridStyle` (inline `gridTemplateColumns`)
- [x] Header: `bg-white/5` → `bg-text-primary/5`
- [x] Total row: `bg-video-edit-bg` → `bg-bg-secondary shadow-xs`
- [x] TrafficRow: ~23 замены hardcoded цветов → theme-aware tokens
- [x] TrafficRow: добавлен hover-trail (350ms/75ms)
- [x] TrafficRow: `gridClassName: string` → `gridStyle: React.CSSProperties`
- ~~TrafficTable → DataTable~~ — отклонено: SmartTrafficTooltip, discrepancy reporting, 3 empty states, conditional columns. Обёртка добавила бы сложность, не убрала

### Stage 5 — Cleanup ✅

- [x] Audit hardcoded цветов: 0 remaining в таблицах (кроме intentional: play icon, now-playing bars, YouTube brand selection)
- [x] `npm run check` — zero errors
- [x] Tests: 1796 pass (738 frontend + 1058 backend)
- [x] Мёртвый код удалён: `TrendsVideoRow.tsx`, `docs/backlog/unified-table.md`

### Production ← YOU ARE HERE

- [x] Архитектура: DataTable в `components/ui/organisms/DataTable/`
- [x] Стоимость: zero runtime cost — CSS-only theming, optional virtualization
- [ ] Accessibility: keyboard navigation, ARIA roles
- [ ] Responsive: column hiding / horizontal scroll

---

## Premium-анимации

Все premium-фишки unified across таблиц:

| Анимация | Реализация |
|----------|-----------|
| **Hover-trail** (350ms fade-out, 75ms snap-in) | `DataTableRow` + TrafficRow (обе реализации) |
| **Selection glow** (blue left border + shadow) | `DataTableRow` — `isSelected` → `bg-[#3EA6FF]` + `shadow-[2px_0_8px_...]` |
| **Alternating row bg** | `DataTableRow` — index-based `bg-text-primary/[0.03]` |
| **Delta dual-speed transition** | `DeltaCell` — `duration-[350ms] group-hover:duration-75` |
| **Thumbnail hover** (scale+brightness+shadow) | `ThumbnailCell` — `group-hover:scale-105 brightness-110` |
| **Now-playing bars** (staggered barBounce) | `ThumbnailCell` — 3 bars с staggered delays |
| **Sort ghost arrow** | `DataTableHeader` — ghost ArrowDown на hover unsorted колонок |

---

## Связанные фичи

- [Traffic Sources](../video-details/traffic-sources.md) — TrafficSourceTable мигрирован на DataTable
- [Suggested Traffic](../video-details/suggested-traffic/README.md) — TrafficTable/TrafficRow: theme fix, без DataTable миграции
- [Trends](../trends/README.md) — TrendsTable мигрирован на DataTable, TrendsVideoRow удалён
- [Design System](../../design-system.md) — CSS variables, z-index scale, animation tokens

---

## Technical Implementation

### Файлы DataTable

| Файл | Назначение |
|------|-----------|
| `src/components/ui/organisms/DataTable/DataTable.tsx` | Generic container: inline gridTemplateColumns, optional TanStack Virtual, sticky header/totals, loading/empty states |
| `src/components/ui/organisms/DataTable/DataTableHeader.tsx` | Sortable headers, `header: ReactNode`, ghost arrows, `bg-text-primary/5` |
| `src/components/ui/organisms/DataTable/DataTableTotalRow.tsx` | Sticky total row, opaque `bg-bg-secondary shadow-xs` |
| `src/components/ui/organisms/DataTable/DataTableRow.tsx` | Row wrapper: hover-trail, alternating bg, selection glow |
| `src/components/ui/organisms/DataTable/cells/DeltaCell.tsx` | Delta display: compact (single line) + full (two-line with pct + original) |
| `src/components/ui/organisms/DataTable/cells/ThumbnailCell.tsx` | Thumbnail: hover effects, lazy load, now-playing bars |
| `src/components/ui/organisms/DataTable/hooks/useTableSort.ts` | Generic sort state (key + direction + toggle) |
| `src/components/ui/organisms/DataTable/types.ts` | `ColumnDef<T>`, `SortConfig`, `DataTableConfig`, `DataTableProps`, `DataTableRowProps` |
| `src/components/ui/organisms/DataTable/index.ts` | Barrel exports |

### Файлы изменённые

| Файл | Что изменилось |
|------|---------------|
| `pages/Details/tabs/TrafficSource/components/TrafficSourceTable.tsx` | Полная миграция → DataTable + column defs (250→160 строк) |
| `pages/Trends/Table/TrendsTable.tsx` | Полная миграция → DataTable + custom renderRow |
| ~~`pages/Trends/Table/TrendsVideoRow.tsx`~~ | Удалён |
| `pages/Trends/Header/TrendsHeader.tsx` | `border-b` условный (только timeline mode) |
| `pages/Details/tabs/Traffic/components/TrafficTable.tsx` | Theme fix: `bg-white/*` → `bg-text-primary/*`, gridClassName → gridStyle |
| `pages/Details/tabs/Traffic/components/TrafficRow.tsx` | Theme fix: ~23 цветовых замены, hover-trail, gridStyle |

### CSS Strategy — Tailwind v4 native, zero new tokens

| Было (hardcoded dark-only) | Стало (Tailwind v4 theme-adaptive) | Почему работает |
|---|---|---|
| `bg-white/[0.035]` | `bg-text-primary/[0.03]` | `--text-primary` = black в light, white в dark |
| `bg-white/[0.05]` | `bg-text-primary/[0.05]` | Автоадаптация |
| `bg-white/5` | `bg-text-primary/5` | Автоадаптация |
| `border-white/5` | `border-text-primary/5` | Автоадаптация |
| `text-white/30` | `text-text-primary/30` | Автоадаптация |
| `bg-video-edit-bg` (total row) | `bg-bg-secondary` | Universal token, не привязан к Video Details |
| `!bg-[#1F1F1F]` (tooltip) | `!bg-card-bg` | Theme token |

### Grid layout — inline style вместо Tailwind JIT

Tailwind v4 JIT не генерирует CSS для динамически собранных классов (`grid-cols-[${...}]`). Все таблицы используют inline `style={{ gridTemplateColumns }}`:
- DataTable: вычисляет `gridStyle` из `ColumnDef.width` через `useMemo`
- TrafficTable: вычисляет `gridStyle` через `useMemo` с conditional tracks (property, publishDate)

### Backdrop-blur: невозможен в таблицах

**Исследовано и подтверждено в Chrome DevTools.** `backdrop-filter` на `position: sticky` элементах внутри `overflow: auto` контейнеров не работает (Chrome compositing bug). Тестировали: inline style, `-webkit-` prefix, `will-change: transform`, `translateZ(0)`, 3-layer sandwich pattern, absolute overlay — ничего не помогло.

Timeline header обходит это: контент скроллится через CSS `transform: translateX()`, header `position: absolute` — нет overflow container. Это фундаментально другая scroll-архитектура.

**Решение:** opaque background (`bg-bg-secondary shadow-xs`). Стандартный подход production data tables (Google Sheets, Notion, Airtable).
