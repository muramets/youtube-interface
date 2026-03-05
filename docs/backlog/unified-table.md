# Unified Table Component

## Что

Объединить три таблицы — **Traffic Sources**, **Suggested Traffic** и **Trends** — в одну общую table-компоненту. Сейчас каждая таблица реализована отдельно с дублированием логики (сортировка, виртуализация, selection, delta badges).

## Зачем

- Единый UX: одинаковое поведение сортировки, фильтров, selection во всех табах
- Меньше кода: shared table infra вместо трёх реализаций
- Проще добавлять новые табличные фичи (export, column resize, keyboard nav)

## Требования

- Сохранить плавные анимации "хвоста" при ховере из Traffic Sources (smooth row hover tail effect)
- Table должна быть generic: принимает column definitions + data → рендерит
- Каждая фича настраивает свои колонки, formatters, row actions

## Затрагивает

- `pages/Details/tabs/TrafficSource/components/TrafficSourceTable.tsx`
- `pages/Details/tabs/Traffic/components/TrafficTable.tsx` + `TrafficRow.tsx`
- `pages/Trends/components/TrendTable.tsx` (или аналог)
- Потенциально: новый shared компонент в `components/ui/molecules/` или `components/DataTable/`

## Связанные docs

- [Traffic Sources](../features/video-details/traffic-sources.md)
- [Suggested Traffic](../features/video-details/suggested-traffic/README.md)
- [Trends](../features/trends/README.md)
