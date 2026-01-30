import React, { useState } from 'react';
import { Trash2, Send, Pencil } from 'lucide-react';
import type { VideoDetails, VideoNote } from '../../core/utils/youtubeApi';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';

import { useAuth } from '../../core/hooks/useAuth';

interface WatchPageNotesProps {
    video: VideoDetails;
}

export const WatchPageNotes: React.FC<WatchPageNotesProps> = ({ video }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const [noteText, setNoteText] = useState('');

    // Editing state
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editNoteText, setEditNoteText] = useState('');

    const handleAddNote = async () => {
        if (!video || !noteText.trim() || !user || !currentChannel) return;

        const newNote: VideoNote = {
            id: Date.now().toString(),
            text: noteText.trim(),
            timestamp: Date.now(),
            userId: currentChannel.id
        };

        const updatedNotes = [...(video.notes || []), newNote];
        await updateVideo({ videoId: video.id, updates: { notes: updatedNotes } });
        setNoteText('');
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!video || !video.notes || !user || !currentChannel) return;
        const updatedNotes = video.notes.filter(n => n.id !== noteId);
        await updateVideo({ videoId: video.id, updates: { notes: updatedNotes } });
    };

    const handleStartEdit = (note: VideoNote) => {
        setEditingNoteId(note.id);
        setEditNoteText(note.text);
    };

    const handleCancelEdit = () => {
        setEditingNoteId(null);
        setEditNoteText('');
    };

    const handleSaveEdit = async () => {
        if (!video || !video.notes || !user || !currentChannel || !editingNoteId) return;

        const updatedNotes = video.notes.map(n =>
            n.id === editingNoteId
                ? { ...n, text: editNoteText.trim() }
                : n
        );

        await updateVideo({ videoId: video.id, updates: { notes: updatedNotes } });
        setEditingNoteId(null);
        setEditNoteText('');
    };

    return (
        <div className="mt-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-text-primary m-0">My Notes</h3>
                <span className="text-xs text-text-secondary bg-bg-secondary px-2 py-1 rounded-md">
                    Private • Visible only to you
                </span>
            </div>

            <div className="flex gap-4 mb-8">
                <div className="w-10 h-10 rounded-full bg-bg-secondary flex-shrink-0 overflow-hidden">
                    {currentChannel?.avatar ? (
                        <img src={currentChannel.avatar} alt="User" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-purple-600 text-white font-bold">
                            {currentChannel?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                    )}
                </div>
                <div className="flex-1">
                    <div className="relative group">
                        <textarea
                            value={noteText}
                            onChange={(e) => {
                                setNoteText(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.value ? `${e.target.scrollHeight}px` : 'auto';
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAddNote();
                                }
                            }}
                            rows={1}
                            placeholder="Add a private note..."
                            className="w-full bg-transparent border-0 border-b border-border focus:border-b-2 focus:border-text-primary py-2 pr-10 text-text-primary outline-none placeholder:text-text-secondary transition-all resize-none overflow-hidden min-h-[40px]"
                        />
                        <button
                            onClick={handleAddNote}
                            disabled={!noteText.trim()}
                            className="absolute right-0 bottom-2 bg-transparent border-none text-text-primary cursor-pointer disabled:opacity-30 hover:text-blue-500 transition-colors p-2 flex items-center justify-center"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-6">
                {(!video.notes || video.notes.length === 0) ? (
                    <div className="text-center text-text-secondary py-8 italic text-sm">
                        No notes yet. Write something to remember!
                    </div>
                ) : (
                    [...(video.notes)].sort((a, b) => b.timestamp - a.timestamp).map((note) => (
                        <div key={note.id} className="flex gap-4 group animate-fade-in items-start">
                            <div className="w-10 h-10 rounded-full bg-bg-secondary flex-shrink-0 overflow-hidden mt-1">
                                {currentChannel?.avatar ? (
                                    <img src={currentChannel.avatar} alt="User" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-purple-600 text-white font-bold">
                                        {currentChannel?.name?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 pt-1">
                                <div className="flex gap-2 items-center mb-1">
                                    <span className="font-bold text-xs text-text-primary">
                                        {currentChannel?.name || 'You'}
                                    </span>
                                    <span className="text-xs text-text-secondary">
                                        {new Date(note.timestamp).toLocaleDateString()} • {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {editingNoteId === note.id ? (
                                    <div className="mt-2">
                                        <textarea
                                            value={editNoteText}
                                            onChange={(e) => setEditNoteText(e.target.value)}
                                            className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-text-primary outline-none focus:border-text-primary transition-colors resize-y min-h-[60px] text-sm"
                                            autoFocus
                                        />
                                        <div className="flex gap-2 mt-2 justify-end">
                                            <button
                                                onClick={handleCancelEdit}
                                                className="px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-secondary rounded-md transition-colors border-none cursor-pointer bg-transparent"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveEdit}
                                                disabled={!editNoteText.trim()}
                                                className="px-3 py-1.5 text-xs font-medium bg-text-primary text-bg-primary rounded-md hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-text-primary whitespace-pre-wrap">
                                        {note.text}
                                    </div>
                                )}
                            </div>

                            {editingNoteId !== note.id && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleStartEdit(note)}
                                        className="bg-transparent border-none text-text-secondary hover:text-text-primary cursor-pointer p-2 rounded-full hover:bg-bg-secondary transition-colors"
                                        title="Edit note"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteNote(note.id)}
                                        className="bg-transparent border-none text-text-secondary hover:text-red-500 cursor-pointer p-2 rounded-full hover:bg-bg-secondary transition-colors"
                                        title="Delete note"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
