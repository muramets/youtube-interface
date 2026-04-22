# Music Sidebar — Collapse UX

> Правила раскрытия/сворачивания секций Music в основном sidebar. Обеспечивает «тихий» вид по умолчанию и сохраняет состояние между переключениями каналов и сессиями.

## Что это такое

Блок Music в левом sidebar. Содержит заголовок (иконка Music + текст), Liked (quick-access плейлист), раскрывающийся список **Playlists** и раскрывающийся список **Shared with me**. По умолчанию всё свёрнуто — чтобы sidebar не перегружал при первом заходе.

## Текущее состояние

← YOU ARE HERE → Collapse UX stable.

- Music-секция по умолчанию свёрнута. Клик по подложке/chevron — toggle. Клик по иконке Music или слову «Music» — навигация на `/music` (если не на странице). Если уже на `/music` — клик по любой части header тоже срабатывает как toggle (через event propagation).
- Liked — всегда виден в развёрнутой Music-секции. Иконка — жёлтая звезда amber-400 (консистентность с pinned favorite channels в Trends).
- Playlists — nested `CollapsibleSection` с заголовком «Playlists (N)». Свёрнут по умолчанию. Внутри работает существующая grouped/ungrouped логика + per-group collapse.
- Shared with me — nested `CollapsibleSection` с заголовком «Shared with me (N)». Свёрнут по умолчанию. Внутри — per-owner entries с собственным collapse.

## User Flow

1. **Свёрнутый вид** — видна только строка Music с иконкой и chevron-right. Визуально «тихо», не отвлекает.
2. **Разворот Music** — клик по подложке/chevron. Появляется Liked + свёрнутые Playlists + свёрнутые Shared with me.
3. **Разворот Playlists / Shared** — независимые toggle'ы, каждое сохраняет своё состояние.
4. **Навигация на /music** — клик по иконке/слову «Music» ведёт на библиотеку, не трогая collapse state.
5. **Сессия и переключение user-канала** — collapse state живёт в localStorage, поэтому переживает reload и любое переключение user-каналов под одним браузером.

## Technical Implementation

### Persist keys (localStorage)

| Ключ | Значение | Default |
|------|----------|---------|
| `music-section-expanded` | `'true' / 'false'` | `false` |
| `music-playlists-expanded` | `'true' / 'false'` | `false` |
| `music-shared-expanded` | `'true' / 'false'` | `false` |
| `music-collapsed-groups` | `JSON string[]` (set of group keys) | `[]` |

`music-collapsed-groups` — существующий per-group persist для именованных групп плейлистов и per-owner shared entries (ключ вида `shared:<ownerChannelId>`).

### Файлы

- `src/pages/Music/Sidebar/MusicSidebarSection.tsx` — все три collapse state'а (Music / Playlists / Shared), обёртки через `CollapsibleSection`.
- `src/components/ui/molecules/CollapsibleSection.tsx` — shared-компонент анимированной grid-rows обёртки, используемый также в Trends sidebar (Global Niches).

### Click-behavior на Music header

Outer row — `onClick={toggle}`. Inner icon+label div — `onClick` условный: если не на `/music`, то `e.stopPropagation() + navigate('/music')`; если уже на `/music`, propagation **не** блокируется — event всплывает, срабатывает outer toggle. Это даёт симметричное поведение: на странице — click всегда toggle, вне страницы — icon/label ведут в библиотеку, а подложка + chevron toggle'ят.

### Liked visual

Отдельный компонент `LikedPlaylistRow` внутри `MusicSidebarSection.tsx`. Иконка — `Star size={16}` с `text-amber-400 fill-amber-400`, тот же amber-токен, что у pinned favorite channels в Trends sidebar. Стиль favorite-row без background-подложки под иконкой — чтобы визуально считывалось как «твой главный pinned плейлист».
