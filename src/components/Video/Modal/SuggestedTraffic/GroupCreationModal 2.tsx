import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { TrafficGroup } from '../../../../types/traffic';

interface GroupCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (group: Omit<TrafficGroup, 'id' | 'videoIds'> & { id?: string }) => void;
    initialData?: TrafficGroup;
}

const COLORS = [
    '#EF4444', // Red
    '#F97316', // Orange
    '#F59E0B', // Amber
    '#84CC16', // Lime
    '#10B981', // Emerald
    '#06B6D4', // Cyan
    '#3B82F6', // Blue
    '#6366F1', // Indigo
    '#8B5CF6', // Violet
    '#D946EF', // Fuchsia
    '#EC4899', // Pink
    '#64748B', // Slate
];

export const GroupCreationModal: React.FC<GroupCreationModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData
}) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState(COLORS[0]);

    useEffect(() => {
        if (isOpen) {
            setName(initialData?.name || '');
            setColor(initialData?.color || COLORS[0]);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
            id: initialData?.id,
            name: name.trim(),
            color
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[400px] bg-modal-surface rounded-xl shadow-2xl border border-white/10 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="text-sm font-medium text-white">
                        {initialData ? 'Edit Niche' : 'Create New Niche'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-text-secondary hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">Niche Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Piano Music"
                            className="w-full bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-text-secondary focus:outline-none focus:border-text-primary transition-colors"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">Color Label</label>
                        <div className="grid grid-cols-6 gap-2">
                            {COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={`w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-modal-surface' : ''}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className="px-3 py-1.5 bg-text-primary text-bg-primary text-xs font-medium rounded hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {initialData ? 'Save Changes' : 'Create Niche'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
