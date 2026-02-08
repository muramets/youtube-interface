import { useMemo } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import type { SuggestedTrafficNiche, TrafficNicheAssignment } from '../../../../../core/types/suggestedTrafficNiches';
import type { TrendNiche } from '../../../../../core/types/trends';
import { assistantLogger } from '../../../../../core/utils/logger';

export interface SmartSuggestion {
    nicheId: string;
    targetNiche: SuggestedTrafficNiche;
    confidence: 'high' | 'medium' | 'low';
    reason: 'hybrid' | 'trends';
    score: number;
    trendsNiche?: TrendNiche; // Original Trends niche data for badge display
}

const EMPTY_PREFS = new Map<string, { nicheId: string; score: number }>();
const EMPTY_SUGGESTIONS = new Map<string, SmartSuggestion>();

export const useSmartNicheSuggestions = (
    sources: TrafficSource[],
    assignments: TrafficNicheAssignment[],
    niches: SuggestedTrafficNiche[],
    videos: VideoDetails[],
    // NEW: Trends data for cross-tab suggestions
    trendsNiches: TrendNiche[] = [],
    trendsVideoAssignments: Record<string, { nicheId: string; addedAt: number }[]> = {},
    // Lazy calculation: skip all computation when assistant is disabled
    isEnabled: boolean = true
) => {
    // 1. Build a map of Preference for each Channel using Hybrid Logic
    // Logic: Harmonic Decay Score = Sum(1 / (index + 1)) over sorted assignments
    const channelPreferences = useMemo(() => {
        // LAZY: Skip computation when assistant is disabled
        if (!isEnabled) return EMPTY_PREFS;

        const prefs = new Map<string, { nicheId: string; score: number }>();
        const videoToChannel = new Map<string, string>();

        // Map assignments to channels using RICH Video Details first (reliable), 
        // falling back to Source data if available.
        videos.forEach(v => {
            if (v.id && v.channelId) {
                videoToChannel.set(v.id, v.channelId);
            }
        });

        // Fallback to source data if needed (though usually less reliable for channelId)
        sources.forEach(source => {
            if (source.videoId && source.channelId) {
                videoToChannel.set(source.videoId, source.channelId);
            }
        });

        // Group assignments by Channel
        const assignmentsByChannel = new Map<string, TrafficNicheAssignment[]>();

        assignments.forEach(assignment => {
            const channelId = videoToChannel.get(assignment.videoId);
            if (channelId) {
                const list = assignmentsByChannel.get(channelId) || [];
                list.push(assignment);
                assignmentsByChannel.set(channelId, list);
            }
        });

        // Calculate Scores for each Channel
        assignmentsByChannel.forEach((channelAssignments, channelId) => {
            // Sort by Date Descending (Newest first)
            channelAssignments.sort((a, b) => b.addedAt - a.addedAt);

            const nicheScores = new Map<string, number>();

            // Apply Harmonic Decay Scoring
            channelAssignments.forEach((assignment, index) => {
                const weight = 1 / (index + 1);
                const currentScore = nicheScores.get(assignment.nicheId) || 0;
                nicheScores.set(assignment.nicheId, currentScore + weight);
            });

            // Find the Winner
            let bestNicheId = '';
            let maxScore = -1;

            nicheScores.forEach((score, nicheId) => {
                if (score > maxScore) {
                    maxScore = score;
                    bestNicheId = nicheId;
                }
            });

            if (bestNicheId) {
                prefs.set(channelId, { nicheId: bestNicheId, score: maxScore });
            }
        });

        assistantLogger.debug('Preference calculation', {
            channelsMapped: assignmentsByChannel.size,
            preferencesSize: prefs.size,
            videoToChannelSize: videoToChannel.size
        });

        return prefs;
    }, [isEnabled, sources, assignments, videos]);

    // 2. Build a Lookup Map for Video -> Suggestion (Optimization)
    // This allows O(1) access during virtualization render cycles instead of searching arrays
    // PRIORITY: Trends-based suggestions > Channel-based suggestions
    const videoSuggestionMap = useMemo(() => {
        // LAZY: Skip computation when assistant is disabled
        if (!isEnabled) return EMPTY_SUGGESTIONS;

        const map = new Map<string, SmartSuggestion>();
        let trendCount = 0;
        let channelCount = 0;

        // Helper: Create a "virtual" SuggestedTrafficNiche from TrendNiche for display
        const createVirtualTrafficNiche = (trendNiche: TrendNiche): SuggestedTrafficNiche => ({
            id: `trends-${trendNiche.id}`, // Prefix to distinguish from real Traffic niches
            channelId: trendNiche.channelId || '',
            name: trendNiche.name,
            color: trendNiche.color,
            createdAt: trendNiche.createdAt
        });

        // STEP 1: Process Trends-based suggestions (HIGHEST PRIORITY)
        // These always win over channel-based suggestions
        Object.entries(trendsVideoAssignments).forEach(([videoId, assignments]) => {
            if (!assignments || assignments.length === 0) return;

            // Take the first (or most recent) assignment
            const primaryAssignment = assignments[0];
            const trendsNiche = trendsNiches.find(n => n.id === primaryAssignment.nicheId);

            if (trendsNiche) {
                map.set(videoId, {
                    nicheId: trendsNiche.id,
                    targetNiche: createVirtualTrafficNiche(trendsNiche),
                    confidence: 'high', // Trends assignments are explicit, so high confidence
                    reason: 'trends',
                    score: 10, // High score to indicate priority
                    trendsNiche: trendsNiche // Include original for click handler
                });
                trendCount++;
            }
        });

        // STEP 2: Process Channel-based suggestions (fallback)
        const processVideo = (videoId: string, channelId?: string) => {
            // Skip if already has Trends-based suggestion
            if (!videoId || !channelId || map.has(videoId)) return;

            const pref = channelPreferences.get(channelId);
            if (!pref) return;

            const niche = niches.find(n => n.id === pref.nicheId);
            if (!niche) return;

            map.set(videoId, {
                nicheId: pref.nicheId,
                targetNiche: niche,
                confidence: pref.score > 1.5 ? 'high' : 'medium',
                reason: 'hybrid',
                score: pref.score
            });
            channelCount++;
        };

        // 2a. Process Rich Video Details
        videos.forEach(v => processVideo(v.id, v.channelId));

        // 2b. Process Sources (fallback for items not in details)
        sources.forEach(s => {
            if (s.videoId && !map.has(s.videoId)) {
                processVideo(s.videoId, s.channelId);
            }
        });

        assistantLogger.debug('Smart suggestions built', {
            totalSuggestions: map.size,
            trendsBased: trendCount,
            channelBased: channelCount
        });

        return map;
    }, [isEnabled, channelPreferences, videos, sources, niches, trendsNiches, trendsVideoAssignments]);

    // 3. Helper to get suggestion for a video (O(1) lookup)
    const getSuggestion = (videoId: string): SmartSuggestion | null => {
        return videoSuggestionMap.get(videoId) || null;
    };

    return {
        getSuggestion,
        channelPreferences
    };
};

