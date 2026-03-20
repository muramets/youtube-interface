/**
 * Position a suggestion popup (slash commands, @-mentions) relative to the cursor,
 * clamping max-height so the dropdown never overflows the viewport.
 *
 * Sets `style.maxHeight` on the popup's first child element (the React container
 * with `overflow-y: auto`), overriding its Tailwind `max-h-*` class when space is tight.
 */
export function positionSuggestionPopup(
    popup: HTMLDivElement,
    rendererElement: HTMLElement,
    rect: DOMRect | null,
    defaultMaxHeight: number,
    direction: 'up' | 'down' = 'down',
): void {
    if (!rect) return

    const GAP = 4
    const VIEWPORT_MARGIN = 8
    const MIN_HEIGHT = 100

    if (direction === 'up') {
        // Chat input: fixed position — input itself is pinned to viewport bottom.
        // clientRect() returns viewport coords which match `position: fixed` directly.
        popup.style.position = 'fixed'
        popup.style.left = `${rect.left}px`
        popup.style.top = 'auto'
        popup.style.bottom = `${window.innerHeight - rect.top + GAP}px`

        const availableAbove = rect.top - VIEWPORT_MARGIN - GAP
        const clampedHeight = Math.max(Math.min(availableAbove, defaultMaxHeight), MIN_HEIGHT)

        const innerEl = rendererElement.firstElementChild as HTMLElement | null
        if (innerEl) {
            innerEl.style.maxHeight = `${clampedHeight}px`
        }
    } else {
        // RTE: fixed position — repositioned on scroll via listener in the extension.
        // clientRect() returns viewport coords which match `position: fixed` directly.
        popup.style.position = 'fixed'
        popup.style.left = `${rect.left}px`
        popup.style.bottom = 'auto'
        const top = rect.bottom + GAP
        popup.style.top = `${top}px`

        const availableBelow = window.innerHeight - top - VIEWPORT_MARGIN
        const clampedHeight = Math.max(Math.min(availableBelow, defaultMaxHeight), MIN_HEIGHT)

        const innerEl = rendererElement.firstElementChild as HTMLElement | null
        if (innerEl) {
            innerEl.style.maxHeight = `${clampedHeight}px`
        }
    }
}
