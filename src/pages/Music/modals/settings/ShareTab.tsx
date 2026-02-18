// =============================================================================
// SHARE TAB: Manage shared access to this channel's music library
// Sub-component of MusicSettingsModal
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Share2, X, Plus, Trash2, Users } from 'lucide-react';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannels } from '../../../../core/hooks/useChannels';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useMusicStore } from '../../../../core/stores/musicStore';
import { MusicSharingService } from '../../../../core/services/musicSharingService';
import type { MusicShareGrant } from '../../../../core/types/musicSharing';

// ---------------------------------------------------------------------------
// Share Tab
// ---------------------------------------------------------------------------

interface ShareTabProps {
    userId: string;
    channelId: string;
}

export const ShareTab: React.FC<ShareTabProps> = ({ userId, channelId }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { data: channels = [] } = useChannels(user?.uid || '');
    const loadSharingGrants = useMusicStore(s => s.loadSharingGrants);
    const sharingGrants = useMusicStore(s => s.sharingGrants);

    const [isAdding, setIsAdding] = useState(false);
    const [isRevoking, setIsRevoking] = useState<string | null>(null);
    const [isGranting, setIsGranting] = useState(false);

    // Load grants on mount
    useEffect(() => {
        loadSharingGrants(userId, channelId);
    }, [userId, channelId, loadSharingGrants]);

    // Channels available to share with (exclude current channel and already-shared channels)
    const availableChannels = channels.filter(
        ch => ch.id !== channelId && !sharingGrants.some(g => g.channelId === ch.id)
    );

    const handleGrant = useCallback(async (granteeChannelId: string, granteeChannelName: string) => {
        setIsGranting(true);
        try {
            await MusicSharingService.grantAccess(
                userId,
                channelId,
                currentChannel?.name || 'Unknown',
                granteeChannelId,
                granteeChannelName,
            );
            await loadSharingGrants(userId, channelId);
            setIsAdding(false);
        } catch (err) {
            console.error('[ShareTab] Failed to grant access:', err);
        } finally {
            setIsGranting(false);
        }
    }, [userId, channelId, currentChannel?.name, loadSharingGrants]);

    const handleRevoke = useCallback(async (granteeChannelId: string) => {
        setIsRevoking(granteeChannelId);
        try {
            await MusicSharingService.revokeAccess(userId, channelId, granteeChannelId);
            await loadSharingGrants(userId, channelId);
        } catch (err) {
            console.error('[ShareTab] Failed to revoke access:', err);
        } finally {
            setIsRevoking(null);
        }
    }, [userId, channelId, loadSharingGrants]);

    return (
        <div className="space-y-4">
            {/* Description */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03]">
                <Share2 size={16} className="text-text-tertiary mt-0.5 shrink-0" />
                <p className="text-xs text-text-secondary leading-relaxed">
                    Share your music library (read-only) with your other channels.
                    Shared channels can browse tracks, playlists, and use them in projects,
                    but cannot upload, edit, or delete tracks.
                </p>
            </div>

            {/* Current shares */}
            {sharingGrants.length > 0 && (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                        <Users size={14} className="text-text-tertiary" />
                        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Shared with ({sharingGrants.length})
                        </span>
                    </div>
                    {sharingGrants.map((grant: MusicShareGrant) => {
                        const ch = channels.find(c => c.id === grant.channelId);
                        return (
                            <div
                                key={grant.channelId}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-hover-bg group transition-colors"
                            >
                                {/* Channel avatar */}
                                <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
                                    {ch?.avatar ? (
                                        <img src={ch.avatar} alt={grant.channelName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <span className="text-xs font-medium text-text-secondary">
                                            {grant.channelName.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-text-primary truncate">
                                        {grant.channelName}
                                    </p>
                                    <p className="text-[11px] text-text-tertiary">
                                        Shared {new Date(grant.grantedAt).toLocaleDateString()}
                                    </p>
                                </div>

                                {/* Revoke */}
                                <button
                                    onClick={() => handleRevoke(grant.channelId)}
                                    disabled={isRevoking === grant.channelId}
                                    className="p-1.5 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                    title="Revoke access"
                                >
                                    {isRevoking === grant.channelId ? (
                                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Trash2 size={14} />
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add channel */}
            {isAdding ? (
                <div className="space-y-1">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-text-secondary">Select a channel</span>
                        <button
                            onClick={() => setIsAdding(false)}
                            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    {availableChannels.length === 0 ? (
                        <p className="text-xs text-text-tertiary px-3 py-4 text-center">
                            No other channels available to share with
                        </p>
                    ) : (
                        <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                            {availableChannels.map(ch => (
                                <button
                                    key={ch.id}
                                    onClick={() => handleGrant(ch.id, ch.name)}
                                    disabled={isGranting}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-hover-bg transition-colors text-left disabled:opacity-50"
                                >
                                    <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
                                        {ch.avatar ? (
                                            <img src={ch.avatar} alt={ch.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        ) : (
                                            <span className="text-xs font-medium text-text-secondary">
                                                {ch.name.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-text-primary truncate">{ch.name}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg w-full text-text-tertiary hover:text-text-primary hover:bg-hover-bg transition-colors"
                >
                    <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                        <Plus size={14} />
                    </div>
                    <span className="text-sm">Share with another channel</span>
                </button>
            )}

            {/* Empty state */}
            {sharingGrants.length === 0 && !isAdding && (
                <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                        <Share2 size={20} className="text-text-tertiary" />
                    </div>
                    <p className="text-sm text-text-secondary mb-1">Not shared yet</p>
                    <p className="text-xs text-text-tertiary">
                        Share your library to let other channels access your tracks
                    </p>
                </div>
            )}
        </div>
    );
};
