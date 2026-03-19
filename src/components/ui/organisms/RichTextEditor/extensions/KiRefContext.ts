import { createContext } from 'react'
import type { KiPreviewData } from '../types'

/**
 * React Context for passing Knowledge Item data to KiRefMark's MarkView component.
 *
 * RichTextEditor wraps the editor in <KiRefContext.Provider value={kiMap}>.
 * KiRefView (MarkView) calls useContext(KiRefContext) to look up KI metadata.
 *
 * Why Context (not Tiptap extension storage):
 * addMarkView() + ReactMarkViewRenderer renders MarkView as a React component
 * in the React tree — full Context access. No Tiptap-specific data threading needed.
 */
export const KiRefContext = createContext<Map<string, KiPreviewData>>(new Map())
