import { createContext } from 'react'
import type { VideoPreviewData } from '../../../../../features/Video/types'

/**
 * React Context for passing video data to VideoRefMark's MarkView component.
 *
 * RichTextEditor wraps the editor in <VideoRefContext.Provider value={videoMap}>.
 * VideoRefView (MarkView) calls useContext(VideoRefContext) to look up video metadata.
 *
 * Why Context (not Tiptap extension storage):
 * addMarkView() + ReactMarkViewRenderer renders MarkView as a React component
 * in the React tree — full Context access. No Tiptap-specific data threading needed.
 */
export const VideoRefContext = createContext<Map<string, VideoPreviewData>>(new Map())
