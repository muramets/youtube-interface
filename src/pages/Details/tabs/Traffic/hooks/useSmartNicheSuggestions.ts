import { useMemo } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import type { SuggestedTrafficNiche, TrafficNicheAssignment } from '../../../../../core/types/suggestedTrafficNiches';
import { assistantLogger } from '../../../../../core/utils/logger';

interface SmartSuggestion {
    nicheId: string;
    targetNiche: SuggestedTrafficNiche;
    confidence: 'high' | 'medium' | 'low';
    reason: 'hybrid';
    score: number;
}

export const useSmartNicheSuggestions = (
    sources: TrafficSource[],
    assignments: TrafficNicheAssignment[],
    niches: SuggestedTrafficNiche[],
    videos: VideoDetails[]
) => {
    // 1. Build a map of Preference for each Channel using Hybrid Logic
    // Logic: Harmonic Decay Score = Sum(1 / (index + 1)) over sorted assignments
    const channelPreferences = useMemo(() => {
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
            // We might not know the channel for EVERY video in history (if it's not in displayed sources),
            // but for the Smart Assistant to be useful in the current table, we mostly care about
            // channels that are currently visible or recently loaded. 
            // However, to be robust, we really need the channel ID for ALL assignments.
            // If `assignments` store doesn't have channelId, we rely on the `sources` lookup.
            // *Correction*: The user passed `allAssignments` from the store.
            // The `TrafficNicheAssignment` type DOES NOT have channelId. It only has videoId, nicheId, addedAt.
            // We can only learn from assignments where we know the Channel ID.

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
                // Score = 1 / (index + 1)
                // 1st (Newest): 1.0
                // 2nd: 0.5
                // 3rd: 0.33
                // ...
                // This gives Recency a heavy initial weight, but allows Frequency to win if consistent.
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
    }, [sources, assignments, videos]);

    // 2. Build a Lookup Map for Video -> Suggestion (Optimization)
    // This allows O(1) access during virtualization render cycles instead of searching arrays
    const videoSuggestionMap = useMemo(() => {
        const map = new Map<string, SmartSuggestion>();

        // We need to map every known video ID to a suggestion if its channel has a preference
        const processVideo = (videoId: string, channelId?: string) => {
            if (!videoId || !channelId) return;

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
        };

        // 1. Process Rich Video Details
        videos.forEach(v => processVideo(v.id, v.channelId));

        // 2. Process Sources (fallback for items not in details)
        sources.forEach(s => {
            // Only process if we haven't already (video details take precedence)
            if (s.videoId && !map.has(s.videoId)) {
                processVideo(s.videoId, s.channelId);
            }
        });

        return map;
    }, [channelPreferences, videos, sources, niches]);

    // 3. Helper to get suggestion for a video (O(1) lookup)
    const getSuggestion = (videoId: string): SmartSuggestion | null => {
        return videoSuggestionMap.get(videoId) || null;
    };

    return {
        getSuggestion,
        channelPreferences
    };
};
