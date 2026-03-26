# Design System

Живая документация по дизайн-системе приложения.
**Правило №1:** Никогда не хардкодить цвета/отступы — только CSS variables и Tailwind-токены.

---

## Архитектура

```
src/index.css           → CSS Custom Properties + Tailwind @theme (единственный источник правды)
                          `:root` / `.dark` — design tokens (цвета по темам)
                          `@theme {}` — Tailwind-маппинг (цвета, z-index, анимации)
src/components/ui/      → Компоненты системы
  atoms/                → Button, Badge, Toggle, Checkbox, SplitButton
  molecules/            → SegmentedControl, Dropdown, Toast, FilterChips, CustomSelect
  organisms/            → ConfirmationModal, FloatingBar, AddContentMenu, DataTable/
```

> **Tailwind v4:** конфигурация живёт в CSS (`@theme`, `@variant`, `@plugin` в `index.css`), а не в отдельном `tailwind.config.js`. Сборка через `@tailwindcss/vite` (нативная Vite-интеграция, без PostCSS).

---

## Цветовые токены

Все цвета — через CSS variables. Автоматически переключаются со светлой на тёмную тему.

### Основная палитра

| Токен Tailwind | CSS Variable | Light | Dark | Использование |
|---|---|---|---|---|
| `text-bg-primary` | `--bg-primary` | #ffffff | #0f0f0f | Основной фон страницы |
| `text-bg-secondary` | `--bg-secondary` | #f9f9f9 | #272727 | Второстепенный фон, карточки |
| `text-text-primary` | `--text-primary` | #0f0f0f | #ffffff | Основной текст |
| `text-text-secondary` | `--text-secondary` | #606060 | #aaaaaa | Вспомогательный текст |
| `text-text-tertiary` | `--text-tertiary` | #909090 | #666666 | Placeholder, disabled |
| `text-accent` | `--accent` | #3b82f6 | #3b82f6 | Акцентный синий (brand) |
| `text-border` | `--border` | #e5e5e5 | #3f3f3f | Разделители, обводки |
| `bg-hover` / `bg-hover-bg` | `--hover-bg` | #f2f2f2 | #3f3f3f | Hover-эффекты |

### Семантические цвета

| CSS Variable | Значение | Использование |
|---|---|---|
| `--primary-button-bg` | #065fd4 | Primary кнопки |
| `--danger-color` | #cc0000 | Деструктивные действия |
| `--color-success` | #22c55e | Успешные состояния |
| `--color-warning` | #f59e0b (light) / #fbbf24 (dark) | Предупреждения (amber) |
| `--color-error` | #ef4444 (light) / #f87171 (dark) | Ошибки (red) |
| `--surface-primary` | #f5f5f5 (light) / #1a1a1a (dark) | Панели, вложенные поверхности |
| `--surface-secondary` | #ebebeb (light) / #2a2a2a (dark) | Вложенные блоки внутри панелей |
| `--reference-highlight` | #818cf8 (light) / #a5b4fc (dark) | @mention в чате |

### Токены для модалок

Отдельная группа `--modal-*` для всех модальных окон.
Используй `bg-modal-bg`, `text-modal-text-primary`, `border-modal-border` и т.д.

### Токены для кнопок

| CSS Variable | Light | Dark |
|---|---|---|
| `--button-secondary-bg` | #F2F2F2 | #3E3E3E |
| `--button-secondary-hover` | #E5E5E5 | #535353 |
| `--button-secondary-text` | #030303 | #FFFFFF |
| `--tag-bg` | #e5e5e5 | #3E3E3E |
| `--tag-hover` | #d4d4d4 | #0D0D0D |

---

## Компоненты

### Button

```tsx
import { Button } from '@/components/ui';
```

**Variants:**

| Variant | Использование |
|---|---|
| `primary` | Главное действие — инвертированные цвета (чёрный/белый) |
| `secondary` *(default)* | Второстепенное действие — серый фон |
| `ghost` | Иконки-кнопки, минималистичные действия |
| `danger` | Delete, Remove — красный |
| `outline` | Важное, но не главное CTA — синяя обводка (#3ea6ff) |
| `accent` | Brand CTA — синий (#065fd4) |

**Sizes:** `sm` (h-8), `md` (h-10, default), `lg` (h-12)

**Базовый стиль:** `rounded-full`, `font-medium`, `transition-colors duration-150`

```tsx
<Button variant="primary">Save</Button>
<Button variant="danger" size="sm" leftIcon={<Trash size={14} />}>Delete</Button>
<Button isLoading>Saving...</Button>
```

---

### Badge

```tsx
import { Badge } from '@/components/ui';
```

**Variants:** `success` (зелёный), `warning` (жёлтый), `error` (красный), `info` (синий), `neutral` *(default)*

Стиль: маленький, `text-[9px]`, `uppercase`, `tracking-wider`, `rounded`.
Цвета: фон с 20% opacity + яркий текст (формула: `bg-color/20 text-color-400`).
Поддерживает обрезку с tooltip при `maxWidth`.

```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning" maxWidth="80px">Restored 3</Badge>
<Badge color="#ff6b35">Custom</Badge>
```

---

### Toggle

```tsx
import { Toggle } from '@/components/ui';
```

**Sizes:** `sm`, `md` *(default)*, `lg`

Синий фон (`bg-blue-600`) в активном состоянии. Белая ручка.

```tsx
<Toggle checked={value} onChange={setValue} />
```

---

### SegmentedControl

```tsx
import { SegmentedControl } from '@/components/ui/molecules/SegmentedControl';
```

Скользящий индикатор выбранного сегмента. Поддерживает N опций равной ширины.

```tsx
<SegmentedControl
  options={[{ value: 'a', label: 'Option A' }, { value: 'b', label: 'Option B' }]}
  value={selected}
  onChange={setSelected}
/>
```

---

### Другие молекулы

| Компонент | Путь | Использование |
|---|---|---|
| `Toast` | `molecules/Toast` | Уведомления — всегда через `notificationStore` |
| `Dropdown` | `molecules/Dropdown` | Простые выпадающие меню |
| `DropdownMenu` | `molecules/DropdownMenu` | Контекстные меню с группами |
| `FilterChips` | `molecules/FilterChips` | Фильтры-чипы |
| `CustomSelect` | `molecules/CustomSelect` | Кастомный select |
| `DateRangePicker` | `molecules/DateRangePicker` | Выбор диапазона дат |
| `CollapsibleSection` | `molecules/CollapsibleSection` | Сворачиваемые секции |
| `ColorPickerPopover` | `molecules/ColorPickerPopover` | Выбор цвета |
| `ConfirmationModal` | `organisms/ConfirmationModal` | Подтверждение действий |
| `FloatingBar` | `organisms/FloatingBar` | Плавающая панель инструментов |
| `DataTable` | `organisms/DataTable/` | Generic таблица данных (см. ниже) |
| `DeltaCell` | `organisms/DataTable/cells/` | Delta value display (compact/full) |
| `ThumbnailCell` | `organisms/DataTable/cells/` | Video thumbnail с hover effects |

---

## Z-Index шкала

**Критично:** Всегда использовать именованные z-index, не числа.

| Класс Tailwind | Значение | Использование |
|---|---|---|
| `z-base` | 0 | Стандартное наложение |
| `z-raised` | 1 | Активные карточки, фокус |
| `z-sticky` | 100 | Sticky заголовки, floating action bars |
| `z-dropdown` | 200 | Dropdown меню, filter popovers |
| `z-popover` | 300 | Context menus, inline popovers, tooltips |
| `z-fab` | 350 | FAB кнопки (Chat, Canvas) — ниже панелей |
| `z-panel` | 400 | Плавающие панели (chat, mini player) |
| `z-panel-elevated` | 401 | Панель над другой панелью |
| `z-overlay-ui` | 403 | UI поверх canvas overlay |
| `z-modal` | 500 | Модальные окна + backdrop |
| `z-modal-stacked` | 550 | Вложенная модалка поверх другой модалки |
| `z-toast` | 600 | Toast уведомления |
| `z-tooltip` | 700 | Standalone tooltips (PortalTooltip) |
| `z-max` | 9999 | Аварийный выход (избегать) |

---

## Анимации

Все анимации определены в `@theme {}` блоке в `src/index.css` (Tailwind v4).
Основная кривая: `cubic-bezier(0.16, 1, 0.3, 1)` — быстрый старт, плавный конец.

| Класс | Использование |
|---|---|
| `animate-fade-in-up` | Появление снизу (модалки, карточки) |
| `animate-fade-in-down` | Появление сверху (dropdown) |
| `animate-scale-in-center` | Масштабирование из центра |
| `animate-slide-up` | Всплытие снизу |
| `animate-fade-in` | Простое появление (0.3s) |
| `animate-shimmer` | Skeleton loading |
| `animate-message-in` | Новое сообщение в чате |

---

## Утилиты (index.css)

| Класс | Использование |
|---|---|
| `.text-shimmer` | Анимированный gradient текст (loading state) |
| `.shimmer-overlay` | Skeleton shimmer поверх контента |
| `.modal-input` | Стандартное поле ввода в модальных окнах |
| `.interactive-text` | Текст `text-tertiary` → `text-primary` при hover |
| `.scrollbar-hide` | Скрыть scrollbar |
| `.scrollbar-compact` | Тонкий scrollbar (3px) |
| `.scrollbar-auto-hide` | Overlay scrollbar (4px), появляется при скролле/hover, исчезает через 1с. Требует JS-класс `.is-scrolling` для анимации при скролле |
| `.hover-trail` | Асимметричный hover: быстрый snap-in (75ms), медленный fade-out (350ms). Transition для `color`, `background-color`, `border-color`, `opacity` |
| `.no-spinner` | Убрать стрелки у `<input type="number">` |

### Scrollbar-поведение

**Компоненты с `overflow-auto/y-auto/x-auto`** получают авто-скрытие scrollbar через `@layer base` — тонкая полоска (4px), прозрачная по умолчанию, появляется при hover/active.

**Document scrollbar** (`html`) — тонкая полоска (6px), прозрачная по умолчанию, появляется при hover на `html`. Используется вместо app-shell scroll (document scroll по YouTube-паттерну).

---

## Типографика

**Шрифт:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...` (системный стек)
**Без кастомных шрифтов.** Вес и размер — только через Tailwind (`text-sm`, `font-medium`, и т.д.)

---

## Правила использования

1. **Никогда не хардкодить цвета.** Даже `#ffffff` — только `--bg-primary` или `text-bg-primary`.
2. **Никогда не хардкодить z-index числами.** Только именованные классы из шкалы.
3. **Модальные окна** — только `--modal-*` токены, не основная палитра.
4. **Все тексты в UI — на английском** (это продукт для международного рынка).
5. **Новые компоненты** — сначала `atoms/`, потом `molecules/`, потом `organisms/`.
6. **Тема** переключается через класс `.dark` на `<html>`. CSS variables подхватывают автоматически.

---

## Расширение системы

Если нужен новый токен:
1. Добавить CSS variable в `:root {}` и `.dark {}` в `src/index.css`
2. Добавить Tailwind-маппинг в `@theme {}` блок в `src/index.css` (например: `--color-my-token: var(--my-token);`)
3. Никогда не создавать токены только для одного компонента — только если используется 2+ раз

> **Tailwind v4 бонус:** `/opacity` modifiers теперь работают с любыми CSS variables. `bg-my-token/50` автоматически генерирует `color-mix(in srgb, var(--color-my-token) 50%, transparent)`. Не нужно создавать отдельные утилитарные классы для semi-transparent вариантов.
