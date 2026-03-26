import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useAuth } from './useAuth'
import { useChannelStore } from '../stores/channelStore'
import { useVideos } from './useVideos'
import { useVideoDeltaMap } from './useVideoDeltaMap'
import type { VideoPreviewData } from '../../features/Video/types'
import type { TrendVideo } from '../types/trends'
import { hasRealVideoData } from '../../../shared/memory'

/**
 * Fetches lightweight video catalog for @-autocomplete in RichTextEditor.
 *
 * Merges:
 * - Own videos (from useVideos — already subscribed)
 * - Trend channel videos (from Firestore, one-time fetch, cached 90min)
 * - View deltas (from useVideoDeltaMap — cached trend snapshots)
 *
 * Returns VideoPreviewData[] sorted by title.
 * Used for editing (@-autocomplete), read-only rendering (vid:// tooltips),
 * and Chat Layer 3 mention resolution.
 *
 * Delta enrichment: videos whose channels are tracked in Trends
 * receive delta24h/7d/30d fields. Others remain without deltas.
 */
export function useVideosCatalog(): VideoPreviewData[] {
    const { user } = useAuth()
    const { currentChannel } = useChannelStore()
    const userId = user?.uid ?? ''
    const channelId = currentChannel?.id ?? ''

    const { videos: ownVideos } = useVideos(userId, channelId)

    const { data: trendVideos } = useQuery<VideoPreviewData[]>({
        queryKey: ['videosCatalog', 'trendVideos', userId, channelId],
        queryFn: async () => {
            const channelsRef = collection(db, `users/${userId}/channels/${channelId}/trendChannels`)
            const channelsSnap = await getDocs(channelsRef)

            const perChannel = await Promise.all(
                channelsSnap.docs.map(async (channelDoc) => {
                    try {
                        const channelData = channelDoc.data()
                        const channelTitle = (channelData.title as string) || channelDoc.id
                        const videosRef = collection(db, `users/${userId}/channels/${channelId}/trendChannels/${channelDoc.id}/videos`)
                        const videosSnap = await getDocs(videosRef)
                        return videosSnap.docs.map((videoDoc) => {
                            const v = videoDoc.data() as TrendVideo
                            return {
                                videoId: v.id,
                                title: v.title,
                                thumbnailUrl: v.thumbnail,
                                channelTitle,
                                viewCount: v.viewCount,
                                publishedAt: v.publishedAt,
                                ownership: 'competitor' as const,
                            }
                        })
                    } catch {
                        return [] // Single channel failure doesn't break the rest
                    }
                })
            )
            return perChannel.flat()
        },
        staleTime: 90 * 60 * 1000,
        enabled: !!userId && !!channelId,
    })

    // Collect all YouTube video IDs for delta lookup
    const allVideoIds = useMemo(() => {
        const ids: string[] = []
        for (const v of ownVideos) {
            ids.push(v.publishedVideoId ?? v.id)
        }
        for (const tv of (trendVideos ?? [])) {
            ids.push(tv.videoId)
        }
        return ids
    }, [ownVideos, trendVideos])

    const { perVideo: deltaMap } = useVideoDeltaMap(allVideoIds)

    return useMemo(() => {
        const catalog: VideoPreviewData[] = []
        const seen = new Set<string>()

        // Own videos first (higher priority)
        for (const v of ownVideos) {
            const key = v.publishedVideoId ?? v.id
            if (seen.has(key)) continue
            seen.add(key)
            const hasRealData = hasRealVideoData(v)
            const deltas = deltaMap.get(v.publishedVideoId ?? v.id)
            catalog.push({
                videoId: v.id,
                youtubeVideoId: v.publishedVideoId ?? v.id,
                title: v.title,
                thumbnailUrl: v.thumbnail,
                channelTitle: v.channelTitle,
                viewCount: hasRealData && v.viewCount ? Number(v.viewCount) : undefined,
                publishedAt: hasRealData ? v.publishedAt : undefined,
                ownership: v.isDraft ? 'own-draft' : 'own-published',
                ...(deltas && {
                    delta24h: deltas.delta24h,
                    delta7d: deltas.delta7d,
                    delta30d: deltas.delta30d,
                }),
            })
        }

        // Trend videos (skip duplicates, enrich with deltas)
        if (trendVideos) {
            for (const tv of trendVideos) {
                if (seen.has(tv.videoId)) continue
                seen.add(tv.videoId)
                const deltas = deltaMap.get(tv.videoId)
                catalog.push({
                    ...tv,
                    ...(deltas && {
                        delta24h: deltas.delta24h,
                        delta7d: deltas.delta7d,
                        delta30d: deltas.delta30d,
                    }),
                })
            }
        }

        catalog.sort((a, b) => a.title.localeCompare(b.title))
        return catalog
    }, [ownVideos, trendVideos, deltaMap])
}
