import React, { useState, useEffect } from 'react';
import { Button } from '../../../../../components/ui/atoms/Button';
import { X } from 'lucide-react';
import { type CsvMapping, DEFAULT_MAPPING } from '../utils/csvParser';

interface ColumnMapperModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: File | null;
    onConfirm: (mapping: CsvMapping) => void;
}

export const ColumnMapperModal: React.FC<ColumnMapperModalProps> = ({ isOpen, onClose, file, onConfirm }) => {
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<CsvMapping>(DEFAULT_MAPPING);
    const [previewRow, setPreviewRow] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen && file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                if (!text) return;
                const lines = text.split('\\n');
                if (lines.length > 0) {
                    // Simple split for headers preview
                    const headerLine = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
                    setHeaders(headerLine);

                    if (lines.length > 1) {
                        // Simple split for data preview
                        const rowOne = lines[1].split(',').map(d => d.replace(/^"|"$/g, '').trim());
                        setPreviewRow(rowOne);
                    }
                }
            };
            reader.readAsText(file);
        }
    }, [isOpen, file]);

    if (!isOpen) return null;

    const fields: { key: keyof CsvMapping; label: string }[] = [
        { key: 'sourceId', label: 'Traffic Source ID (e.g. YT_RELATED...)' },
        { key: 'sourceType', label: 'Source Type' },
        { key: 'sourceTitle', label: 'Source Title' },
        { key: 'impressions', label: 'Impressions' },
        { key: 'ctr', label: 'CTR' },
        { key: 'views', label: 'Views' },
        { key: 'avgDuration', label: 'Avg. Duration' },
        { key: 'watchTime', label: 'Watch Time (Hours)' },
    ];

    const handleFieldChange = (key: keyof CsvMapping, colIndex: number) => {
        setMapping(prev => ({ ...prev, [key]: colIndex }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-bg-secondary border border-white/10 rounded-2xl w-full max-w-2xl text-text-primary shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Map CSV Columns</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <p className="text-sm text-text-secondary mb-6">
                        The CSV format seems to have changed. Please map the columns from your file to the required fields.
                    </p>

                    <div className="space-y-4">
                        {fields.map(field => (
                            <div key={field.key} className="grid grid-cols-2 gap-4 items-center">
                                <label className="text-sm font-medium text-text-secondary">
                                    {field.label}
                                </label>
                                <select
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                                    value={mapping[field.key]}
                                    onChange={(e) => handleFieldChange(field.key, parseInt(e.target.value))}
                                >
                                    {headers.map((h, idx) => (
                                        <option key={idx} value={idx}>
                                            {idx + 1}. {h} {previewRow[idx] ? `(${previewRow[idx].substring(0, 15)}...)` : ''}
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
