// =============================================================================
// Traffic Source Column Mapper Modal
//
// Fallback UI when CSV auto-detection fails (MAPPING_REQUIRED).
// User manually maps CSV columns to Traffic Source fields.
// Based on existing ColumnMapperModal pattern but adapted for 6 columns.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Button } from '../../../../../components/ui/atoms/Button';
import { X } from 'lucide-react';
import { parseCsvLine } from '../../../../../core/utils/csvUtils';
import type { TrafficSourceCsvMapping } from '../utils/trafficSourceParser';

interface TrafficSourceColumnMapperModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: File | null;
    onConfirm: (mapping: TrafficSourceCsvMapping) => void;
}

const FIELDS: { key: keyof TrafficSourceCsvMapping; label: string; hint: string }[] = [
    { key: 'source', label: 'Traffic Source', hint: 'e.g. "Suggested videos", "Browse features"' },
    { key: 'views', label: 'Views', hint: 'Number of views' },
    { key: 'watchTime', label: 'Watch Time', hint: 'Watch time in hours' },
    { key: 'avgDuration', label: 'Average Duration', hint: 'e.g. "0:11:35"' },
    { key: 'impressions', label: 'Impressions', hint: 'Number of impressions' },
    { key: 'ctr', label: 'CTR', hint: 'Click-through rate (%)' },
];

const DEFAULT_MAPPING: TrafficSourceCsvMapping = {
    source: 0,
    views: 1,
    watchTime: 2,
    avgDuration: 3,
    impressions: 4,
    ctr: 5,
};

export const TrafficSourceColumnMapperModal: React.FC<TrafficSourceColumnMapperModalProps> = ({
    isOpen,
    onClose,
    file,
    onConfirm,
}) => {
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<TrafficSourceCsvMapping>(DEFAULT_MAPPING);
    const [previewRow, setPreviewRow] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen && file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                if (!text) return;
                const lines = text.split('\n');
                if (lines.length > 0) {
                    const headerLine = parseCsvLine(lines[0]).map(h =>
                        h.replace(/^"|"$/g, '').trim()
                    );
                    setHeaders(headerLine);

                    if (lines.length > 1) {
                        const rowOne = parseCsvLine(lines[1]).map(d =>
                            d.replace(/^"|"$/g, '').trim()
                        );
                        setPreviewRow(rowOne);
                    }
                }
            };
            reader.readAsText(file);
        }
    }, [isOpen, file]);

    if (!isOpen) return null;

    const handleFieldChange = (key: keyof TrafficSourceCsvMapping, colIndex: number) => {
        setMapping(prev => ({ ...prev, [key]: colIndex }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-bg-secondary border border-white/10 rounded-2xl w-full max-w-2xl text-text-primary shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Map Traffic Source Columns</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <p className="text-sm text-text-secondary mb-6">
                        Could not auto-detect CSV columns. Please map each column from your file to the correct field.
                    </p>

                    <div className="space-y-4">
                        {FIELDS.map(field => (
                            <div key={field.key} className="grid grid-cols-2 gap-4 items-center">
                                <div>
                                    <label className="text-sm font-medium text-text-secondary">
                                        {field.label}
                                    </label>
                                    <p className="text-xs text-text-tertiary mt-0.5">{field.hint}</p>
                                </div>
                                <select
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                                    value={mapping[field.key]}
                                    onChange={(e) => handleFieldChange(field.key, parseInt(e.target.value))}
                                >
                                    {headers.map((h, idx) => (
                                        <option key={idx} value={idx}>
                                            {idx + 1}. {h}
                                            {previewRow[idx] ? ` (${previewRow[idx].substring(0, 20)})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-bg-secondary rounded-b-2xl">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={() => onConfirm(mapping)}>
                        Apply Mapping
                    </Button>
                </div>
            </div>
        </div>
    );
};
