import type { KiPreviewData } from '../types'

const EMPTY_KI_MAP = new Map<string, KiPreviewData>()

/**
 * Build a lookup Map from a KiPreviewData catalog.
 */
export function buildCatalogKiMap(catalog: KiPreviewData[] | undefined): Map<string, KiPreviewData> {
    if (!catalog?.length) return EMPTY_KI_MAP
    const map = new Map<string, KiPreviewData>()
    for (const ki of catalog) {
        map.set(ki.id, ki)
    }
    return map
}
