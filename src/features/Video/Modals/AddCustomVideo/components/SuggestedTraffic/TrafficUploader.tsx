import React, { useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';

interface TrafficUploaderProps {
    onUpload: (file: File) => void;
    isLoading?: boolean;
    error?: string | null;
    isCompact?: boolean;
}

export const TrafficUploader: React.FC<TrafficUploaderProps> = ({ onUpload, isLoading, error, isCompact }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'text/csv') {
            onUpload(file);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpload(file);
        }
    };

    if (isCompact) {
        return (
            <div
                className={`
                    relative border border-white/10 rounded-lg px-3 py-2 text-center transition-colors cursor-pointer flex items-center gap-2 hover:bg-white/5
                    ${isDragging ? 'border-text-primary bg-white/5' : ''}
                    ${isLoading ? 'opacity-50 pointer-events-none' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileSelect}
                />
                {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                    <Upload size={14} className="text-text-secondary" />
                )}
                <span className="text-xs text-text-secondary hover:text-text-primary transition-colors">
                    {isLoading ? 'Updating...' : 'Update CSV'}
                </span>
            </div>
        );
    }

    return (
        <div
            className={`
                relative border border-white/10 rounded-xl p-8 text-center transition-colors cursor-pointer bg-bg-secondary
                ${isDragging ? 'border-text-primary bg-white/5' : 'hover:border-white/20 hover:bg-white/5'}
                ${isLoading ? 'opacity-50 pointer-events-none' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
            />

            <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-text-secondary">
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Upload size={24} />
                    )}
                </div>
                <div>
                    <h3 className="text-text-primary font-medium mb-1">
                        {isLoading ? 'Processing CSV...' : 'Upload Traffic CSV'}
                    </h3>
                    <p className="text-xs text-text-secondary">
                        Drag and drop or click to select
                    </p>
                </div>
            </div>

            {error && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full">
                        <AlertCircle size={12} />
                        <span>{error}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
