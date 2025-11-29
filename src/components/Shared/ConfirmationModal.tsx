import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel'
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[400px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary m-0">{title}</h2>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 text-text-secondary text-base">
                    {message}
                </div>

                <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg font-medium text-text-secondary hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className="px-4 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 transition-colors border-none cursor-pointer"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
