import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

interface ToastProps {
    message: string;
    isVisible: boolean;
    duration?: number;
    onClose: () => void;
    type?: 'success' | 'error';
    position?: 'top' | 'bottom';
}

export const Toast: React.FC<ToastProps> = ({
    message,
    isVisible,
    duration = 3000,
    onClose,
    type = 'success',
    position = 'bottom'
}) => {
    const [shouldRender, setShouldRender] = useState(false);
    const [animationClass, setAnimationClass] = useState('');

    useEffect(() => {
        if (isVisible) {
            setShouldRender(true);
            setAnimationClass(position === 'top' ? 'animate-fade-in-down' : 'animate-fade-in-up');

            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        } else if (shouldRender) {
            setAnimationClass(position === 'top' ? 'animate-fade-out-up' : 'animate-fade-out-down');
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 300); // Match animation duration
            return () => clearTimeout(timer);
        }
    }, [isVisible, duration, onClose, shouldRender, position]);

    if (!shouldRender) return null;

    const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    const Icon = type === 'success' ? CheckCircle : AlertCircle;
    const positionClass = position === 'top' ? 'top-8' : 'bottom-8';

    return createPortal(
        <div className={`fixed ${positionClass} left-1/2 -translate-x-1/2 z-[2000]`} onClick={(e) => e.stopPropagation()}>
            <div className={`${bgColor} text-white pl-4 pr-3 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] ${animationClass}`}>
                <Icon size={20} className="text-white flex-shrink-0" />
                <span className="text-sm font-medium flex-grow">{message}</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    className="bg-transparent border-none text-white/80 hover:text-white cursor-pointer p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
                >
                    <X size={16} />
                </button>
            </div>
        </div>,
        document.body
    );
};
