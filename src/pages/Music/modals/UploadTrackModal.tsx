import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Check, Search, Music } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Track } from '../../../core/types/track';
import { Button } from '../../../components/ui/atoms/Button/Button';
import { useTrackForm } from '../hooks/useTrackForm';
import { useMusicStore } from '../../../core/stores/musicStore';
import { DEFAULT_ACCENT_COLOR } from '../../../core/utils/trackUtils';
import { AudioDropZone } from '../components/upload/AudioDropZone';
import { AudioFileSlots } from '../components/upload/AudioFileSlots';
import { TagSection } from '../components/upload/TagSection';
import { PRESET_COLORS } from '../utils/constants';
import { formatDuration } from '../utils/formatDuration';

interface UploadTrackModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    channelId: string;
    editTrack?: Track | null;
    initialTab?: 'track' | 'library' | 'versions';
}

export const UploadTrackModal: React.FC<UploadTrackModalProps> = ({
    isOpen,
    onClose,
    userId,
    channelId,
    editTrack,
    initialTab,
}) => {
    const form = useTrackForm({ isOpen, onClose, userId, channelId, editTrack });
    const [activeTab, setActiveTab] = useState<'track' | 'library' | 'versions'>(initialTab ?? 'track');
    const [isVariation, setIsVariation] = useState(false);
    const [versionSearch, setVersionSearch] = useState('');
    const [selectedVersionTargetId, setSelectedVersionTargetId] = useState<string | null>(null);

    const bodyRef = useRef<HTMLDivElement>(null);

    // Reset tab when modal opens
    useEffect(() => {
        if (isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate prop-sync on modal open
            setActiveTab(initialTab ?? 'track');
            setIsVariation(false);
            setVersionSearch('');
            setSelectedVersionTargetId(null);
        }
    }, [isOpen, initialTab]);

    // Reset scroll position when switching tabs
    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
    }, [activeTab]);

    // --- Versions tab data (reuses LinkVersionModal logic) ---
    const tracks = useMusicStore(s => s.tracks);
    const linkAsVersion = useMusicStore(s => s.linkAsVersion);
    const allGenres = useMusicStore(s => s.genres);
    const showVersionsTab = !form.isEditMode && isVariation;

    const versionCandidates = useMemo(() => {
        // Show only ungrouped tracks + display track (parent) of each group
        const groupDisplayIds = new Set<string>();
        const groupMap = new Map<string, typeof tracks>();
        for (const t of tracks) {
            if (!t.groupId) continue;
            if (!groupMap.has(t.groupId)) groupMap.set(t.groupId, []);
            groupMap.get(t.groupId)!.push(t);
        }
        for (const [, groupTracks] of groupMap) {
            const sorted = [...groupTracks].sort((a, b) => {
                if (a.groupOrder !== undefined && b.groupOrder !== undefined) {
                    return a.groupOrder - b.groupOrder;
                }
                return b.createdAt - a.createdAt;
            });
            if (sorted[0]) groupDisplayIds.add(sorted[0].id);
        }

        return tracks.filter((t) => {
            if (t.groupId && !groupDisplayIds.has(t.id)) return false;
            return true;
        });
    }, [tracks]);

    const filteredVersionCandidates = useMemo(() => {
        if (!versionSearch.trim()) return versionCandidates;
        const q = versionSearch.toLowerCase();
        return versionCandidates.filter(
            (t) =>
                t.title.toLowerCase().includes(q) ||
                t.artist?.toLowerCase().includes(q)
        );
    }, [versionCandidates, versionSearch]);

    // Track whether the mousedown started on the overlay itself (not inside the modal content).
    // This prevents accidental closes when text-selection drag ends outside the modal.
    const mouseDownOnOverlayRef = useRef(false);

    if (!isOpen && !form.isClosing) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-modal flex items-center justify-center p-4 backdrop-blur-sm ${form.isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ backgroundColor: 'var(--modal-overlay)' }}
            onMouseDown={() => { mouseDownOnOverlayRef.current = true; }}
            onClick={() => {
                if (mouseDownOnOverlayRef.current) form.handleClose();
                mouseDownOnOverlayRef.current = false;
            }}
        >
            <div
                className={`relative w-full max-w-[640px] h-[85vh] bg-bg-secondary rounded-xl shadow-2xl flex flex-col overflow-hidden ${form.isClosing ? 'animate-scale-out' : 'animate-scale-in'} transition-colors duration-200`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-4 pb-0 flex flex-col border-b border-border flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xl font-medium text-text-primary">{form.isEditMode ? 'Edit Track' : 'Upload Track'}</h2>
                        <button
                            onClick={form.handleClose}
                            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    {/* Tab Bar */}
                    <div className="flex gap-4">
                        {(['track', 'library', ...(showVersionsTab ? ['versions' as const] : [])] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-2.5 text-sm font-medium transition-colors border-b-2 ${activeTab === tab
                                    ? 'text-text-primary border-white'
                                    : 'text-text-tertiary border-transparent hover:text-text-secondary'
                                    }`}
                            >
                                {tab === 'track' ? 'Track' : tab === 'library' ? 'Library' : 'Versions'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Body */}
                <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain p-6 flex flex-col gap-5 min-h-0">
                    {activeTab === 'track' && (
                        <>
                            {/* Hero Drop Zone */}
                            <AudioDropZone
                                coverPreview={form.coverPreview}
                                coverInputRef={form.coverInputRef}
                                onCoverSelect={form.handleCoverSelect}
                                isDragOver={form.isDragOver}
                                setIsDragOver={form.setIsDragOver}
                                onDrop={form.handleDrop}
                                vocalFile={form.vocalFile}
                                instrumentalFile={form.instrumentalFile}
                                isInstrumentalOnly={form.isInstrumentalOnly}
                                onAudioFileSelect={form.handleAudioFileBrowse}
                            />

                            {/* Audio File Slots */}
                            <AudioFileSlots
                                isInstrumentalOnly={form.isInstrumentalOnly}
                                setIsInstrumentalOnly={form.setIsInstrumentalOnly}
                                vocalFile={form.vocalFile}
                                instrumentalFile={form.instrumentalFile}
                                setVocalFile={form.setVocalFile}
                                setInstrumentalFile={form.setInstrumentalFile}
                                vocalInputRef={form.vocalInputRef}
                                instrumentalInputRef={form.instrumentalInputRef}
                                previewPlaying={form.previewPlaying}
                                togglePreview={form.togglePreview}
                                onAudioSelect={form.handleAudioSelect}
                                onSwap={form.swapFiles}
                            />

                            {/* Variation toggle (upload mode only) */}
                            {!form.isEditMode && (
                                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <div
                                        onClick={(e) => {
                                            e.preventDefault();
                                            const next = !isVariation;
                                            setIsVariation(next);
                                            if (!next) setActiveTab('track');
                                        }}
                                        className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${isVariation ? 'bg-[var(--primary-button-bg)]' : 'bg-white/10'
                                            }`}
                                    >
                                        <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-200 ${isVariation ? 'translate-x-[16px]' : 'translate-x-[2px]'
                                            }`} />
                                    </div>
                                    <span className="text-xs text-text-secondary">
                                        Variation of other track
                                    </span>
                                </label>
                            )}

                            {/* Title & Artist */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                                        Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.title}
                                        onChange={(e) => form.setTitle(e.target.value)}
                                        placeholder="Track title..."
                                        className="modal-input"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                                        Artist
                                    </label>
                                    <input
                                        type="text"
                                        value={form.artist}
                                        onChange={(e) => form.setArtist(e.target.value)}
                                        placeholder="Artist name..."
                                        className="modal-input"
                                    />
                                </div>
                            </div>

                            {/* Prompt */}
                            <div>
                                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                                    AI Prompt
                                </label>
                                <textarea
                                    value={form.prompt}
                                    onChange={(e) => form.setPrompt(e.target.value)}
                                    placeholder="What prompt generated this track?"
                                    rows={3}
                                    className="modal-input resize-y overflow-hidden"
                                    style={{ overflow: 'auto' }}
                                />
                            </div>

                            {/* Lyrics — fills remaining space */}
                            <div className="flex-1 flex flex-col min-h-[120px]">
                                <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                                    Lyrics
                                </label>
                                <textarea
                                    value={form.lyrics}
                                    onChange={(e) => form.setLyrics(e.target.value)}
                                    placeholder="Paste lyrics here..."
                                    className="modal-input flex-1 resize-none"
                                    style={{ overflow: 'auto' }}
                                />
                            </div>
                        </>
                    )}

                    {activeTab === 'library' && (
                        <>
                            {/* Genre & BPM */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                                        Genre
                                    </label>
                                    {form.isAddingGenre ? (
                                        <div className="flex gap-1.5">
                                            <input
                                                type="text"
                                                value={form.newGenreName}
                                                onChange={(e) => form.setNewGenreName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (!form.newGenreName.trim()) return;
                                                        const name = form.newGenreName.trim();
                                                        const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || uuidv4();
                                                        const color = PRESET_COLORS[form.genres.length % PRESET_COLORS.length];
                                                        const newGenre = { id, name, color, order: form.genres.length };
                                                        const updated = [...form.genres, newGenre];
                                                        form.saveSettings(userId, channelId, { genres: updated, tags: form.tags });
                                                        form.setSelectedGenre(id);
                                                        form.setNewGenreName('');
                                                        form.setIsAddingGenre(false);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        form.setIsAddingGenre(false);
                                                        form.setNewGenreName('');
                                                    }
                                                }}
                                                placeholder="Genre name..."
                                                className="modal-input flex-1 !py-1.5 text-xs"
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => { form.setIsAddingGenre(false); form.setNewGenreName(''); }}
                                                className="p-2 text-text-tertiary hover:text-text-primary"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <select
                                            value={form.selectedGenre}
                                            onChange={(e) => {
                                                if (e.target.value === '__new__') {
                                                    form.setIsAddingGenre(true);
                                                    e.target.value = form.selectedGenre;
                                                } else {
                                                    form.setSelectedGenre(e.target.value);
                                                }
                                            }}
                                            className="modal-input appearance-none !py-1.5 text-xs"
                                        >
                                            <option value="">Select genre...</option>
                                            {form.genres.map((g) => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                            <option value="__new__">+ New genre</option>
                                        </select>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                                        BPM
                                    </label>
                                    <input
                                        type="number"
                                        value={form.bpm}
                                        onChange={(e) => form.setBpm(e.target.value)}
                                        placeholder="120"
                                        className="modal-input no-spinner !py-1.5 text-xs"
                                    />
                                </div>
                            </div>

                            {/* Tags */}
                            <TagSection
                                tags={form.tags}
                                genres={form.genres}
                                categoryOrder={form.categoryOrder}
                                selectedTags={form.selectedTags}
                                onSelectedChange={form.setSelectedTags}
                                userId={userId}
                                channelId={channelId}
                                onSaveSettings={form.saveSettings}
                            />
                        </>
                    )}

                    {activeTab === 'versions' && showVersionsTab && (
                        <div className="flex flex-col gap-3 flex-1 min-h-0">
                            <p className="text-xs text-text-tertiary">
                                Link existing tracks as versions of this one. They will be grouped together.
                            </p>

                            {/* Search */}
                            <div className="flex items-center gap-2 bg-white/[0.06] rounded-lg px-3 py-2">
                                <Search size={14} className="text-text-tertiary flex-shrink-0" />
                                <input
                                    type="text"
                                    value={versionSearch}
                                    onChange={(e) => setVersionSearch(e.target.value)}
                                    placeholder="Search tracks..."
                                    className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder-text-tertiary"
                                    autoFocus
                                />
                            </div>

                            {/* Track list */}
                            <div className="flex-1 overflow-y-auto -mx-6 min-h-0">
                                {filteredVersionCandidates.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
                                        <Music size={24} className="mb-2 opacity-50" />
                                        <span className="text-sm">No matching tracks</span>
                                    </div>
                                ) : (
                                    filteredVersionCandidates.map((track) => {
                                        const genreInfo = allGenres.find((g) => g.id === track.genre);
                                        const isInGroup = !!track.groupId;
                                        const isSelected = selectedVersionTargetId === track.id;
                                        return (
                                            <button
                                                key={track.id}
                                                onClick={() => setSelectedVersionTargetId(isSelected ? null : track.id)}
                                                className={`w-full flex items-center gap-3 px-6 py-2.5 transition-colors cursor-pointer bg-transparent border-none text-left ${isSelected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'}`}
                                            >
                                                {/* Mini cover */}
                                                <div
                                                    className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center"
                                                    style={{
                                                        background: track.coverUrl
                                                            ? undefined
                                                            : `linear-gradient(135deg, ${genreInfo?.color || DEFAULT_ACCENT_COLOR}88, ${genreInfo?.color || DEFAULT_ACCENT_COLOR}44)`,
                                                    }}
                                                >
                                                    {track.coverUrl ? (
                                                        <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-white/60 text-[10px] font-bold">
                                                            {track.title.charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Title + artist */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-text-primary truncate m-0 flex items-center gap-1.5">
                                                        {track.title}
                                                        {isInGroup && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-text-tertiary">
                                                                grouped
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-[11px] text-text-tertiary truncate m-0">
                                                        {track.artist || 'Unknown'}
                                                    </p>
                                                </div>

                                                {/* Duration */}
                                                <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0">
                                                    {track.duration > 0 ? formatDuration(track.duration) : '—'}
                                                </span>

                                                {/* Selection indicator */}
                                                {isSelected && (
                                                    <Check size={14} className="text-indigo-400 flex-shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Error message */}
                    {form.error && (
                        <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
                            {form.error}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 h-[67px] border-t border-border flex items-center justify-end gap-2 bg-bg-secondary flex-shrink-0">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={form.handleClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        leftIcon={form.isEditMode ? <Check size={14} /> : <Upload size={14} />}
                        onClick={async () => {
                            // Determine groupId & groupOrder BEFORE creating the track
                            // so it appears in the correct position from the start (no UI jank)
                            let groupId: string | undefined;
                            let groupOrder: number | undefined;
                            if (!form.isEditMode && selectedVersionTargetId) {
                                const targetTrack = tracks.find(t => t.id === selectedVersionTargetId);
                                groupId = targetTrack?.groupId || uuidv4();

                                // Place new track at the end of the group
                                const groupMembers = tracks.filter(t => t.groupId && t.groupId === targetTrack?.groupId);
                                const maxOrder = groupMembers.reduce((max, t) => Math.max(max, t.groupOrder ?? 0), 0);
                                groupOrder = groupMembers.length > 0 ? maxOrder + 1 : 1;
                                // Target track is order 0 (will be set by linkAsVersion if needed)
                            }

                            const newTrackId = await form.handleSubmit(
                                groupId ? { groupId, groupOrder } : undefined
                            );

                            // Ensure the target track also has the same groupId
                            if (newTrackId && !form.isEditMode && selectedVersionTargetId && userId && channelId) {
                                await linkAsVersion(userId, channelId, newTrackId, selectedVersionTargetId);
                            }
                        }}
                        disabled={form.isEditMode
                            ? !form.title.trim()
                            : (!form.vocalFile.file && !form.instrumentalFile.file)
                        }
                        isLoading={form.isSubmitting}
                    >
                        {form.isSubmitting
                            ? (form.isEditMode ? 'Saving...' : 'Uploading...')
                            : (form.isEditMode ? 'Save' : 'Upload')
                        }
                    </Button>
                </div>
            </div>
        </div >,
        document.body
    );
};
