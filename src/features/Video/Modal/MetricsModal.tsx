import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { PackagingMetrics } from '../../../core/utils/youtubeApi';

interface MetricsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (metrics: PackagingMetrics) => void;
    checkinTargetVersion: number | null;
    currentPackagingVersion: number;
}

export const MetricsModal: React.FC<MetricsModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    checkinTargetVersion,
    currentPackagingVersion
}) => {
    const [metricsData, setMetricsData] = useState<PackagingMetrics>({
        impressions: 0,
        ctr: 0,
        views: 0,
        avdSeconds: 0
    });
    const [avdInput, setAvdInput] = useState('');

    // State is reset when component remounts (controlled by parent conditional rendering)

    const handleAvdChange = (value: string) => {
        setAvdInput(value);
        if (value.includes(':')) {
            const parts = value.split(':').map(Number);
            if (parts.length === 2) {
                setMetricsData(prev => ({ ...prev, avdSeconds: parts[0] * 60 + parts[1] }));
            } else if (parts.length === 3) {
                setMetricsData(prev => ({ ...prev, avdSeconds: parts[0] * 3600 + parts[1] * 60 + parts[2] }));
            }
        } else {
            setMetricsData(prev => ({ ...prev, avdSeconds: Number(value) || 0 }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-bg-secondary w-full max-w-md rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-scale-in border border-border">
                <div className="p-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-white mb-2">
                            {checkinTargetVersion !== null ? `Add Check-in to v.${checkinTargetVersion}` : `Finalize v.${currentPackagingVersion} & Upgrade`}
                        </h3>
                        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
                            <X size={20} />
                        </button>
                    </div>
                    <p className="text-sm text-[#AAAAAA] mb-6">
                        To track the performance impact of your new packaging, please enter the metrics for the previous version at the time of the change.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs text-[#AAAAAA]">Views</label>
                        <input
                            type="number"
                            value={metricsData.views ?? ''}
                            onChange={(e) => setMetricsData(prev => ({ ...prev, views: e.target.value === '' ? null : Number(e.target.value) }))}
                            className="w-full bg-[#1F1F1F] border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs text-[#AAAAAA]">CTR (%)</label>
                        <input
                            type="number"
                            value={metricsData.ctr ?? ''}
                            onChange={(e) => setMetricsData(prev => ({ ...prev, ctr: e.target.value === '' ? null : Number(e.target.value) }))}
                            className="w-full bg-[#1F1F1F] border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0.0"
                            step="0.1"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs text-[#AAAAAA]">AVD (Time)</label>
                        <input
                            type="text"
                            value={avdInput}
                            onChange={(e) => handleAvdChange(e.target.value)}
                            className="modal-input"
                            placeholder="e.g. 1:30"
                        />
                        <span className="text-xs text-text-secondary">Parsed: {metricsData.avdSeconds}s</span>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-text-primary hover:bg-bg-tertiary transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(metricsData)}
                        className="px-4 py-2 rounded-lg bg-primary-button-bg text-white font-medium hover:bg-primary-button-hover transition-colors"
                    >
                        {checkinTargetVersion !== null ? 'Add Check-in' : 'Save & Upgrade Version'}
                    </button>
                </div>
            </div>
        </div>
    );
};
