import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { PortalTooltip } from '../Shared/PortalTooltip';

import type { CustomLanguage } from '../../services/channelService';
import { type VideoLocalization } from '../../utils/youtubeApi';

interface LanguageTabsProps {
    activeLanguage: string;
    localizations: Record<string, VideoLocalization>;
    onSwitchLanguage: (code: string) => void;
    onAddLanguage: (code: string, customName?: string, customFlag?: string) => void;
    onRemoveLanguage: (code: string) => void;
    savedCustomLanguages?: CustomLanguage[];
    onDeleteCustomLanguage?: (code: string) => void;
}

export const LanguageTabs: React.FC<LanguageTabsProps> = ({
    activeLanguage,
    localizations,
    onSwitchLanguage,
    onAddLanguage,
    onRemoveLanguage,
    savedCustomLanguages = [],
    onDeleteCustomLanguage
}) => {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

    // Custom Language State
    const [isCustomMode, setIsCustomMode] = useState(false);
    const [customName, setCustomName] = useState('');
    const [customCode, setCustomCode] = useState('');
    const [customEmoji, setCustomEmoji] = useState('');

    // Merge supported and saved custom languages
    const allLanguages = [
        ...SUPPORTED_LANGUAGES,
        ...savedCustomLanguages.filter(custom =>
            !SUPPORTED_LANGUAGES.some(supported => supported.code === custom.code)
        )
    ];

    // Filter out languages that are already added
    const availableLanguages = allLanguages.filter(
        lang => !localizations[lang.code]
    );

    useEffect(() => {
        if (isAddOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + 8,
                left: rect.left
            });
        } else {
            // Reset custom mode when closing
            setIsCustomMode(false);
            setCustomName('');
            setCustomCode('');
            setCustomEmoji('');
        }
    }, [isAddOpen]);

    // Close dropdown on scroll to prevent detachment
    useEffect(() => {
        if (isAddOpen) {
            const handleScroll = () => setIsAddOpen(false);
            window.addEventListener('scroll', handleScroll, true);
            return () => window.removeEventListener('scroll', handleScroll, true);
        }
    }, [isAddOpen]);

    const handleAddCustomLanguage = () => {
        if (!customName || !customCode) return;

        onAddLanguage(
            customCode.toLowerCase(),
            customName,
            customEmoji || undefined
        );
        setIsAddOpen(false);
    };

    return (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* Primary Tab */}
            <PortalTooltip content="Main packaging language" enterDelay={500}>
                <button
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 ${activeLanguage === 'default'
                        ? 'bg-text-primary text-bg-primary'
                        : 'bg-bg-secondary text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                        }`}
                    onClick={() => onSwitchLanguage('default')}
                >
                    <span>ENG</span>
                </button>
            </PortalTooltip>

            {/* Localized Tabs */}
            {Object.keys(localizations).map(code => {
                const localization = localizations[code];

                // Use custom metadata if available, otherwise fallback to predefined
                const codeDisplay = (localization.languageCode || code).toUpperCase();

                return (
                    <div
                        key={code}
                        className={`group relative flex items-center rounded-full transition-colors flex-shrink-0 ${activeLanguage === code
                            ? 'bg-text-primary text-bg-primary'
                            : 'bg-bg-secondary text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                            }`}
                    >
                        <button
                            className="pl-3 pr-1 py-1.5 text-xs font-medium flex items-center gap-1.5"
                            onClick={() => onSwitchLanguage(code)}
                        >
                            <span>{codeDisplay}</span>
                        </button>

                        {/* Remove Button (only visible on hover or active) */}
                        <button
                            type="button"
                            className={`p-0.5 rounded-full hover:bg-white/20 hover:text-red-500 ${activeLanguage === code ? 'text-bg-primary' : 'text-text-secondary'
                                } opacity-0 group-hover:opacity-100 transition-all mr-1`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveLanguage(code);
                            }}
                        >
                            <X size={12} />
                        </button>
                    </div>
                );
            })}

            {/* Add Language Button */}
            <div className="relative flex-shrink-0">
                <PortalTooltip content="Create packaging in another language" enterDelay={500}>
                    <button
                        ref={buttonRef}
                        className="w-7 h-7 rounded-full bg-bg-secondary text-text-secondary hover:bg-hover-bg hover:text-text-primary flex items-center justify-center transition-colors"
                        onClick={() => setIsAddOpen(!isAddOpen)}
                    >
                        <Plus size={16} />
                    </button>
                </PortalTooltip>

                {isAddOpen && createPortal(
                    <>
                        <div
                            className="fixed inset-0 z-[1049]"
                            onClick={() => setIsAddOpen(false)}
                        />
                        <div
                            className="fixed z-[1050] bg-bg-secondary border border-border rounded-lg shadow-xl w-max min-w-[160px] animate-scale-in origin-top-left overflow-hidden"
                            style={{
                                top: dropdownPosition.top,
                                left: dropdownPosition.left
                            }}
                        >
                            {!isCustomMode ? (
                                <>
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                        {availableLanguages.map(lang => {
                                            const isCustom = savedCustomLanguages.some(l => l.code === lang.code);
                                            return (
                                                <div
                                                    key={lang.code}
                                                    className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-hover-bg flex items-center justify-between group transition-colors cursor-pointer"
                                                    onClick={() => {
                                                        onAddLanguage(lang.code);
                                                        setIsAddOpen(false);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-base font-emoji">{lang.flag}</span>
                                                        <span>{lang.name}</span>
                                                    </div>
                                                    {isCustom && onDeleteCustomLanguage && (
                                                        <button
                                                            className="text-text-secondary hover:text-red-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteCustomLanguage(lang.code);
                                                            }}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="border-t border-border p-2">
                                        <button
                                            className="w-full text-left px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded flex items-center gap-2 transition-colors"
                                            onClick={() => setIsCustomMode(true)}
                                        >
                                            <Plus size={12} />
                                            <span>Add Custom Language</span>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="p-3 flex flex-col gap-3 w-[250px]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">New Language</span>
                                        <button
                                            onClick={() => setIsCustomMode(false)}
                                            className="text-text-secondary hover:text-text-primary"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Flag (e.g. 🇺🇸)"
                                            className="w-[105px] bg-bg-secondary border border-border rounded-lg p-2 text-sm text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder px-2 min-w-0 tracking-normal"
                                            value={customEmoji}
                                            onChange={(e) => setCustomEmoji(e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Code (e.g. EN)"
                                            className="flex-1 bg-bg-secondary border border-border rounded-lg p-2 text-sm text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder px-2 min-w-0 tracking-normal"
                                            value={customCode}
                                            onChange={(e) => setCustomCode(e.target.value)}
                                            maxLength={5}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Name (e.g. English)"
                                        className="w-full bg-bg-secondary border border-border rounded-lg p-2 text-sm text-text-primary focus:border-text-primary outline-none transition-colors hover:border-text-primary placeholder-modal-placeholder"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                    />

                                    <button
                                        disabled={!customName || !customCode}
                                        onClick={handleAddCustomLanguage}
                                        className="w-full bg-text-primary text-bg-primary rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed h-[38px] flex items-center justify-center"
                                    >
                                        Add Language
                                    </button>
                                </div>
                            )}
                        </div>
                    </>,
                    document.body
                )}
            </div>
        </div>
    );
};
