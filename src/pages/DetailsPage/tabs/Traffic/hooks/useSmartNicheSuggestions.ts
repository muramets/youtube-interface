import { useMemo } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import type { SuggestedTrafficNiche, TrafficNicheAssignment } from '../../../../../core/types/suggestedTrafficNiches';

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

        return prefs;
    }, [sources, assignments]);

    // 2. Helper to get suggestion for a video
    const getSuggestion = (videoId: string): SmartSuggestion | null => {
        // Find channel for this video - Try our internal map logic or direct lookup
        let channelId: string | undefined;

        // Try getting from video details array (most reliable)
        const video = videos.find(v => v.id === videoId);
        if (video?.channelId) {
            channelId = video.channelId;
        } else {
            // Fallback to source
            const source = sources.find(s => s.videoId === videoId);
            channelId = source?.channelId;
        }

        if (!channelId) return null;

        const pref = channelPreferences.get(channelId);
        if (!pref) return null;

        const niche = niches.find(n => n.id === pref.nicheId);
        if (!niche) return null;

        return {
            nicheId: pref.nicheId,
            targetNiche: niche,
            confidence: pref.score > 1.5 ? 'high' : 'medium',
            reason: 'hybrid',
            score: pref.score
        };
    };

    return {
        getSuggestion,
        channelPreferences
    };
};
