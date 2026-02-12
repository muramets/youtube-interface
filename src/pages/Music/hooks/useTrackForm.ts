// =============================================================================
// USE TRACK FORM: Hook encapsulating all state & logic for upload/edit modal
// =============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { deleteField } from 'firebase/firestore';
import { TrackService } from '../../../core/services/trackService';
import { uploadTrackAudio, uploadTrackCover } from '../../../core/services/storageService';
import { useMusicStore } from '../../../core/stores/musicStore';
import type { Track, TrackCreateData } from '../../../core/types/track';
import { extractPeaksFromFile } from '../../../core/utils/audioPeaks';
import { extractAudioMetadata } from '../../../core/utils/audioMetadata';

export interface FileState {
    file: File | null;
    name: string;
    uploading: boolean;
    progress: number;
}

export const EMPTY_FILE: FileState = { file: null, name: '', uploading: false, progress: 0 };

interface UseTrackFormProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    channelId: string;
    editTrack?: Track | null;
}

// Helper: get audio duration from File
function getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
            resolve(audio.duration);
            URL.revokeObjectURL(audio.src);
        };
        audio.onerror = () => {
            resolve(0);
            URL.revokeObjectURL(audio.src);
        };
        audio.src = URL.createObjectURL(file);
    });
}

export function useTrackForm({ isOpen, onClose, userId, channelId, editTrack }: UseTrackFormProps) {
    const { genres, tags, categoryOrder, saveSettings } = useMusicStore();
    const isEditMode = !!editTrack;

    // Form state
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [bpm, setBpm] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [prompt, setPrompt] = useState('');
    const [isInstrumentalOnly, setIsInstrumentalOnly] = useState(false);

    // Inline creation state (genre only — tag UI state lives inside TagSection)
    const [isAddingGenre, setIsAddingGenre] = useState(false);
    const [newGenreName, setNewGenreName] = useState('');

    // File state
    const [vocalFile, setVocalFile] = useState<FileState>(EMPTY_FILE);
    const [instrumentalFile, setInstrumentalFile] = useState<FileState>(EMPTY_FILE);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string>('');

    // UI state
    const [isClosing, setIsClosing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState('');

    const vocalInputRef = useRef<HTMLInputElement>(null);
    const instrumentalInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    // Audio preview
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const [previewPlaying, setPreviewPlaying] = useState<'vocal' | 'instrumental' | null>(null);
    const vocalUrlRef = useRef<string | null>(null);
    const instrumentalUrlRef = useRef<string | null>(null);

    const stopPreview = useCallback(() => {
        if (audioPreviewRef.current) {
            audioPreviewRef.current.pause();
            audioPreviewRef.current.src = '';
        }
        setPreviewPlaying(null);
    }, []);

    const togglePreview = useCallback((variant: 'vocal' | 'instrumental') => {
        const file = variant === 'vocal' ? vocalFile.file : instrumentalFile.file;
        // In edit mode, files may not be locally loaded — use remote URL
        const remoteUrl = variant === 'vocal' ? editTrack?.vocalUrl : editTrack?.instrumentalUrl;
        if (!file && !remoteUrl) return;

        if (previewPlaying === variant) {
            stopPreview();
            return;
        }

        const urlRef = variant === 'vocal' ? vocalUrlRef : instrumentalUrlRef;
        if (!urlRef.current) {
            urlRef.current = file ? URL.createObjectURL(file) : remoteUrl!;
        }

        if (!audioPreviewRef.current) {
            audioPreviewRef.current = new Audio();
            audioPreviewRef.current.addEventListener('ended', () => setPreviewPlaying(null));
        }

        audioPreviewRef.current.src = urlRef.current;
        audioPreviewRef.current.play();
        setPreviewPlaying(variant);
    }, [previewPlaying, vocalFile.file, instrumentalFile.file, editTrack, stopPreview]);

    // Cleanup object URLs when files are removed (skip remote URLs from edit mode)
    useEffect(() => {
        if (!vocalFile.file && vocalUrlRef.current && vocalUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(vocalUrlRef.current);
            vocalUrlRef.current = null;
            if (previewPlaying === 'vocal') stopPreview();
        }
    }, [vocalFile.file, previewPlaying, stopPreview]);

    useEffect(() => {
        if (!instrumentalFile.file && instrumentalUrlRef.current && instrumentalUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(instrumentalUrlRef.current);
            instrumentalUrlRef.current = null;
            if (previewPlaying === 'instrumental') stopPreview();
        }
    }, [instrumentalFile.file, previewPlaying, stopPreview]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (vocalUrlRef.current) URL.revokeObjectURL(vocalUrlRef.current);
            if (instrumentalUrlRef.current) URL.revokeObjectURL(instrumentalUrlRef.current);
            if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
                audioPreviewRef.current = null;
            }
        };
    }, []);

    // Pre-populate form when opening in edit mode
    useEffect(() => {
        if (!isOpen || !editTrack) return;
        setTitle(editTrack.title || '');
        setArtist(editTrack.artist || '');
        setSelectedGenre(editTrack.genre || '');
        setSelectedTags(editTrack.tags || []);
        setBpm(editTrack.bpm ? String(editTrack.bpm) : '');
        setLyrics(editTrack.lyrics || '');
        setPrompt(editTrack.prompt || '');
        setIsInstrumentalOnly(!editTrack.vocalUrl && !!editTrack.instrumentalUrl);
        setCoverPreview(editTrack.coverUrl || '');
        if (editTrack.vocalUrl) {
            setVocalFile({ file: null, name: editTrack.vocalFileName || `${editTrack.title} (Vocal).mp3`, uploading: false, progress: 100 });
        }
        if (editTrack.instrumentalUrl) {
            setInstrumentalFile({ file: null, name: editTrack.instrumentalFileName || `${editTrack.title} (Instrumental).mp3`, uploading: false, progress: 100 });
        }
    }, [isOpen, editTrack]);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        stopPreview();
        if (vocalUrlRef.current) { URL.revokeObjectURL(vocalUrlRef.current); vocalUrlRef.current = null; }
        if (instrumentalUrlRef.current) { URL.revokeObjectURL(instrumentalUrlRef.current); instrumentalUrlRef.current = null; }
        setTimeout(() => {
            onClose();
            setIsClosing(false);
            setTitle('');
            setArtist('');
            setSelectedGenre('');
            setSelectedTags([]);
            setBpm('');
            setLyrics('');
            setPrompt('');
            setIsInstrumentalOnly(false);
            setVocalFile(EMPTY_FILE);
            setInstrumentalFile(EMPTY_FILE);
            setCoverFile(null);
            setCoverPreview('');
            setError('');
        }, 200);
    }, [onClose, stopPreview]);

    // Auto-fill form fields from audio file metadata (ID3 tags)
    const applyMetadata = useCallback(async (file: File) => {
        const meta = await extractAudioMetadata(file);
        if (meta.title && !title) setTitle(meta.title);
        if (meta.artist && !artist) setArtist(meta.artist);
        if (meta.lyrics && !lyrics) setLyrics(meta.lyrics);
        if (meta.bpm && !bpm) setBpm(String(meta.bpm));
        if (meta.coverBlob && !coverFile) {
            const coverFileObj = new File(
                [meta.coverBlob],
                `cover.${meta.coverType?.split('/')[1] || 'jpg'}`,
                { type: meta.coverType || 'image/jpeg' }
            );
            setCoverFile(coverFileObj);
            const reader = new FileReader();
            reader.onload = (e) => setCoverPreview(e.target?.result as string);
            reader.readAsDataURL(meta.coverBlob);
        }
    }, [title, artist, lyrics, bpm, coverFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        const audioFiles = files.filter((f) => {
            const ext = f.name.split('.').pop()?.toLowerCase() || '';
            return ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext);
        });

        if (audioFiles.length > 0) {
            const firstFile = audioFiles[0];
            const fileState: FileState = { file: firstFile, name: firstFile.name, uploading: false, progress: 0 };

            if (isInstrumentalOnly) {
                if (!instrumentalFile.file) {
                    setInstrumentalFile(fileState);
                    if (!title) {
                        const name = firstFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                        setTitle(name);
                    }
                    applyMetadata(firstFile);
                }
            } else {
                if (!vocalFile.file) {
                    if (audioFiles.length > 1) {
                        // Smart detection: check if one file is instrumental by name
                        const instrPattern = /instr/i;
                        const instrIndex = audioFiles.findIndex(f => instrPattern.test(f.name.replace(/\.[^/.]+$/, '')));

                        let vocalF: File, instrF: File;
                        if (instrIndex >= 0) {
                            instrF = audioFiles[instrIndex];
                            vocalF = audioFiles[instrIndex === 0 ? 1 : 0];
                        } else {
                            vocalF = audioFiles[0];
                            instrF = audioFiles[1];
                        }

                        setVocalFile({ file: vocalF, name: vocalF.name, uploading: false, progress: 0 });
                        setInstrumentalFile({ file: instrF, name: instrF.name, uploading: false, progress: 0 });

                        if (!title) {
                            // Use vocal file name for title (cleaner)
                            const name = vocalF.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                            setTitle(name);
                        }
                        applyMetadata(vocalF);
                    } else {
                        setVocalFile(fileState);
                        if (!title) {
                            const name = firstFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                            setTitle(name);
                        }
                        applyMetadata(firstFile);
                    }
                } else if (!instrumentalFile.file) {
                    setInstrumentalFile(fileState);
                }
            }
        }
    }, [vocalFile.file, instrumentalFile.file, title, applyMetadata, isInstrumentalOnly]);

    const handleAudioSelect = useCallback((variant: 'vocal' | 'instrumental', file: File) => {
        const state: FileState = { file, name: file.name, uploading: false, progress: 0 };
        if (variant === 'vocal') {
            setVocalFile(state);
            if (!title) {
                const name = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                setTitle(name);
            }
            applyMetadata(file);
        } else {
            setInstrumentalFile(state);
            if (!vocalFile.file) {
                if (!title) {
                    const name = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                    setTitle(name);
                }
                applyMetadata(file);
            }
        }
    }, [title, vocalFile.file, applyMetadata]);

    const handleCoverSelect = useCallback((file: File) => {
        setCoverFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setCoverPreview(e.target?.result as string);
        reader.readAsDataURL(file);
    }, []);



    const swapFiles = useCallback(() => {
        stopPreview();
        const tmpVocal = vocalFile;
        setVocalFile(instrumentalFile);
        setInstrumentalFile(tmpVocal);
        const tmpUrl = vocalUrlRef.current;
        vocalUrlRef.current = instrumentalUrlRef.current;
        instrumentalUrlRef.current = tmpUrl;
    }, [vocalFile, instrumentalFile, stopPreview]);

    const handleSubmit = useCallback(async () => {
        if (!title.trim()) {
            setError('Track title is required');
            return;
        }
        const hasVocal = vocalFile.file || (isEditMode && vocalFile.name);
        const hasInstrumental = instrumentalFile.file || (isEditMode && instrumentalFile.name);
        if (!hasVocal && !hasInstrumental) {
            setError('At least one audio file is required');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const trackId = isEditMode ? editTrack!.id : uuidv4();
            let vocalUrl: string | undefined = isEditMode ? editTrack!.vocalUrl : undefined;
            let vocalStoragePath: string | undefined = isEditMode ? editTrack!.vocalStoragePath : undefined;
            let instrumentalUrl: string | undefined = isEditMode ? editTrack!.instrumentalUrl : undefined;
            let instrumentalStoragePath: string | undefined = isEditMode ? editTrack!.instrumentalStoragePath : undefined;
            let coverUrl: string | undefined = isEditMode ? editTrack!.coverUrl : undefined;
            let coverStoragePath: string | undefined = isEditMode ? editTrack!.coverStoragePath : undefined;
            let vocalPeaks: number[] | undefined = isEditMode ? editTrack!.vocalPeaks : undefined;
            let instrumentalPeaks: number[] | undefined = isEditMode ? editTrack!.instrumentalPeaks : undefined;
            let vocalFileName: string | undefined = isEditMode ? editTrack!.vocalFileName : undefined;
            let instrumentalFileName: string | undefined = isEditMode ? editTrack!.instrumentalFileName : undefined;
            let duration = isEditMode ? editTrack!.duration : 0;

            if (vocalFile.file) {
                setVocalFile((prev) => ({ ...prev, uploading: true }));
                const [result, peaks] = await Promise.all([
                    uploadTrackAudio(userId, channelId, trackId, 'vocal', vocalFile.file),
                    extractPeaksFromFile(vocalFile.file),
                ]);
                vocalUrl = result.downloadUrl;
                vocalStoragePath = result.storagePath;
                vocalPeaks = peaks;
                vocalFileName = vocalFile.file.name;
                duration = await getAudioDuration(vocalFile.file);
                setVocalFile((prev) => ({ ...prev, uploading: false, progress: 100 }));
            }

            if (instrumentalFile.file) {
                setInstrumentalFile((prev) => ({ ...prev, uploading: true }));
                const [result, peaks] = await Promise.all([
                    uploadTrackAudio(userId, channelId, trackId, 'instrumental', instrumentalFile.file),
                    extractPeaksFromFile(instrumentalFile.file),
                ]);
                instrumentalUrl = result.downloadUrl;
                instrumentalStoragePath = result.storagePath;
                instrumentalPeaks = peaks;
                instrumentalFileName = instrumentalFile.file.name;
                if (duration === 0) duration = await getAudioDuration(instrumentalFile.file);
                setInstrumentalFile((prev) => ({ ...prev, uploading: false, progress: 100 }));
            }

            if (coverFile) {
                const result = await uploadTrackCover(userId, channelId, trackId, coverFile);
                coverUrl = result.downloadUrl;
                coverStoragePath = result.storagePath;
            }

            if (isEditMode) {
                const raw: Record<string, unknown> = {
                    title: title.trim(),
                    artist: artist.trim() || deleteField(),
                    genre: selectedGenre || 'other',
                    tags: selectedTags,
                    bpm: bpm ? parseInt(bpm, 10) : deleteField(),
                    lyrics: lyrics.trim() || deleteField(),
                    prompt: prompt.trim() || deleteField(),
                    duration,
                    vocalUrl,
                    vocalStoragePath,
                    vocalPeaks,
                    instrumentalUrl,
                    instrumentalStoragePath,
                    instrumentalPeaks,
                    vocalFileName,
                    instrumentalFileName,
                    coverUrl,
                    coverStoragePath,
                };
                // Firestore rejects `undefined` — strip those fields entirely
                const updates = Object.fromEntries(
                    Object.entries(raw).filter(([, v]) => v !== undefined)
                );
                await TrackService.updateTrack(userId, channelId, trackId, updates);
            } else {
                const trackData: TrackCreateData = {
                    title: title.trim(),
                    artist: artist.trim() || undefined,
                    genre: selectedGenre || 'other',
                    tags: selectedTags,
                    bpm: bpm ? parseInt(bpm, 10) : undefined,
                    lyrics: lyrics.trim() || undefined,
                    prompt: prompt.trim() || undefined,
                    duration,
                    vocalUrl,
                    vocalStoragePath,
                    vocalPeaks,
                    instrumentalUrl,
                    instrumentalStoragePath,
                    instrumentalPeaks,
                    vocalFileName,
                    instrumentalFileName,
                    coverUrl,
                    coverStoragePath,
                };
                await TrackService.createTrack(userId, channelId, trackData, trackId);
            }

            handleClose();
        } catch (err) {
            console.error(isEditMode ? '[Edit] Failed:' : '[Upload] Failed:', err);
            setError(isEditMode ? 'Save failed. Please try again.' : 'Upload failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }, [title, artist, selectedGenre, selectedTags, bpm, lyrics, prompt, vocalFile, instrumentalFile, coverFile, isEditMode, editTrack, userId, channelId, handleClose]);

    return {
        // Form state
        title, setTitle,
        artist, setArtist,
        selectedGenre, setSelectedGenre,
        selectedTags, setSelectedTags,
        bpm, setBpm,
        lyrics, setLyrics,
        prompt, setPrompt,
        isInstrumentalOnly, setIsInstrumentalOnly,

        // Inline genre creation
        isAddingGenre, setIsAddingGenre,
        newGenreName, setNewGenreName,

        // File state
        vocalFile, setVocalFile,
        instrumentalFile, setInstrumentalFile,
        coverFile,
        coverPreview,

        // Refs
        vocalInputRef,
        instrumentalInputRef,
        coverInputRef,

        // UI state
        isClosing,
        isSubmitting,
        isDragOver, setIsDragOver,
        error,
        isEditMode,

        // Audio preview
        previewPlaying,
        togglePreview,
        stopPreview,

        // Settings from store
        genres,
        tags,
        categoryOrder,
        saveSettings,

        // Handlers
        handleClose,
        handleDrop,
        handleAudioSelect,
        handleCoverSelect,
        handleSubmit,
        swapFiles,
    };
}
