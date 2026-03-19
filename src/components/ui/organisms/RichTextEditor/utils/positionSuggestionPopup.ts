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
): void {
    if (!rect) return

    const GAP = 4
    const VIEWPORT_MARGIN = 8
    const MIN_HEIGHT = 100

    const top = rect.bottom + GAP
    popup.style.left = `${rect.left}px`
    popup.style.top = `${top}px`

    const availableBelow = window.innerHeight - top - VIEWPORT_MARGIN
    const clampedHeight = Math.max(Math.min(availableBelow, defaultMaxHeight), MIN_HEIGHT)

    const innerEl = rendererElement.firstElementChild as HTMLElement | null
    if (innerEl) {
        innerEl.style.maxHeight = `${clampedHeight}px`
    }
}
