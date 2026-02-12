// =============================================================================
// UPLOAD TRACK MODAL: Premium drag & drop upload flow
// Thin layout component — logic lives in useTrackForm hook
// =============================================================================

import React from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Track } from '../../../core/types/track';
import { Button } from '../../../components/ui/atoms/Button/Button';
import { useTrackForm } from '../hooks/useTrackForm';
import { AudioDropZone } from '../components/upload/AudioDropZone';
import { AudioFileSlots } from '../components/upload/AudioFileSlots';
import { TagSection } from '../components/upload/TagSection';
import { PRESET_COLORS } from '../utils/constants';

interface UploadTrackModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    channelId: string;
    editTrack?: Track | null;
}

export const UploadTrackModal: React.FC<UploadTrackModalProps> = ({
    isOpen,
    onClose,
    userId,
    channelId,
    editTrack,
}) => {
    const form = useTrackForm({ isOpen, onClose, userId, channelId, editTrack });

    if (!isOpen && !form.isClosing) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm ${form.isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ backgroundColor: 'var(--modal-overlay)' }}
            onClick={form.handleClose}
        >
            <div
                className={`relative w-full max-w-[640px] max-h-[85vh] bg-bg-secondary rounded-xl shadow-2xl flex flex-col overflow-hidden ${form.isClosing ? 'animate-scale-out' : 'animate-scale-in'} transition-colors duration-200`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 h-[63px] flex items-center justify-between border-b border-border flex-shrink-0">
                    <h2 className="text-xl font-medium text-text-primary">{form.isEditMode ? 'Edit Track' : 'Upload Track'}</h2>
                    <button
                        onClick={form.handleClose}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
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
                                        className="modal-input flex-1"
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
                                    className="modal-input appearance-none"
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
                                className="modal-input no-spinner"
                            />
                        </div>
                    </div>

                    {/* Lyrics */}
                    <div>
                        <label className="text-xs text-text-secondary font-medium tracking-wider uppercase mb-1.5 block">
                            Lyrics
                        </label>
                        <textarea
                            value={form.lyrics}
                            onChange={(e) => form.setLyrics(e.target.value)}
                            placeholder="Paste lyrics here..."
                            rows={4}
                            className="modal-input resize-y overflow-hidden"
                            style={{ overflow: 'auto' }}
                        />
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

                    {/* Tags */}
                    <TagSection
                        tags={form.tags}
                        genres={form.genres}
                        selectedTags={form.selectedTags}
                        onSelectedChange={form.setSelectedTags}
                        userId={userId}
                        channelId={channelId}
                        onSaveSettings={form.saveSettings}
                    />

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
                        onClick={form.handleSubmit}
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
        </div>,
        document.body
    );
};
