import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle } from 'lucide-react';

interface ToastProps {
    message: string;
    isVisible: boolean;
    duration?: number;
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, isVisible, duration = 3000, onClose }) => {
    const [shouldRender, setShouldRender] = useState(false);
    const [animationClass, setAnimationClass] = useState('');

    useEffect(() => {
        if (isVisible) {
            setShouldRender(true);
            setAnimationClass('animate-fade-in-up');

            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        } else if (shouldRender) {
            setAnimationClass('animate-fade-out-down');
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 300); // Match animation duration
            return () => clearTimeout(timer);
        }
    }, [isVisible, duration, onClose, shouldRender]);

    if (!shouldRender) return null;

    return createPortal(
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[2000]">
            <div className={`bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] ${animationClass}`}>
                <CheckCircle size={20} className="text-white" />
                <span className="text-sm font-medium">{message}</span>
            </div>
        </div>,
        document.body
    );
};
