import React, { useState } from 'react';
import { Trophy, X, Save } from 'lucide-react';

interface PickTheWinnerBarProps {
    ranked: number;
    total: number;
    isComplete: boolean;
    onSave: (name: string) => void;
    onDiscard: () => void;
}

export const PickTheWinnerBar: React.FC<PickTheWinnerBarProps> = ({
    ranked,
    total,
    isComplete,
    onSave,
    onDiscard,
}) => {
    const [showModal, setShowModal] = useState(false);
    const [name, setName] = useState('');

    const handleSave = () => {
        if (!name.trim()) return;
        onSave(name.trim());
        setShowModal(false);
        setName('');
    };

    return (
        <>
            <div className="mx-6 mb-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-orange-500/10 border border-amber-500/20 flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-3">
                    <Trophy size={18} className="text-amber-400" />
                    <span className="text-sm font-semibold text-white">
                        Pick the Winner
                    </span>
                    <span className="text-sm text-text-secondary">
                        {ranked}/{total} ranked
                    </span>
                    <div className="h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-300"
                            style={{ width: `${total > 0 ? (ranked / total) * 100 : 0}%` }}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowModal(true)}
                        disabled={!isComplete}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border-none cursor-pointer ${isComplete
                                ? 'bg-amber-500 text-black hover:bg-amber-400'
                                : 'bg-white/5 text-text-tertiary cursor-not-allowed'
                            }`}
                    >
                        <Save size={14} />
                        Save
                    </button>
                    <button
                        onClick={onDiscard}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-colors border-none cursor-pointer"
                    >
                        <X size={14} />
                        Discard
                    </button>
                </div>
            </div>

            {/* Save Modal */}
            {showModal && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-bg-secondary border border-border rounded-2xl p-6 w-[360px] shadow-2xl animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <Trophy size={20} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white m-0">Save Ranking</h3>
                                <p className="text-xs text-text-secondary m-0">This ranking will appear in the sort menu</p>
                            </div>
                        </div>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Ranking name..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') setShowModal(false);
                            }}
                            className="w-full bg-bg-primary text-white text-sm px-4 py-3 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 placeholder:text-text-secondary mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-colors border-none cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!name.trim()}
                                className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Save Ranking
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
