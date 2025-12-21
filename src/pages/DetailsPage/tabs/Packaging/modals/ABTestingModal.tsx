import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import { getABTestRank, getRankBorderClass } from '../utils/abTestRank';

type ABTestMode = 'title' | 'thumbnail' | 'both';

interface ABTestingModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab: ABTestMode;
    currentTitle: string;
    currentThumbnail: string;
    titleVariants: string[];
    thumbnailVariants: string[];
    onSave: (data: {
        mode: ABTestMode;
        titles: string[];
        thumbnails: string[];
        results: {
            titles: number[];
            thumbnails: number[];
        };
        packagingChanged: boolean;  // true if titles/thumbnails changed, false if only results
    }) => void;
    initialResults?: {
        titles: number[];
        thumbnails: number[];
    };
}

const SmartPercentageInput: React.FC<{
    value: number;
    onChange: (value: number) => void;
    max?: number;
    borderClassName?: string;
}> = ({ value, onChange, max = 100, borderClassName = 'border-[#3F3F3F]' }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove non-digits
        let raw = e.target.value.replace(/[^\d]/g, '');

        // Limit to 3 digits
        if (raw.length > 3) {
            raw = raw.slice(0, 3);
        }

        if (!raw) {
            onChange(0);
            return;
        }

        let numVal = parseInt(raw, 10);

        // Formatting logic: 222 -> 22.2, but 100 -> 100
        if (raw.length === 3 && numVal !== 100) {
            numVal = numVal / 10;
        }

        // Clamp to max
        if (numVal > max) {
            numVal = max;
        }

        onChange(numVal);
    };

    return (
        <div className="relative w-full">
            <input
                type="text"
                inputMode="decimal"
                value={value > 0 ? value : ''}
                onChange={handleChange}
                className={`w-full bg-modal-input-bg text-modal-text-primary text-right text-sm font-medium p-2 pr-7 rounded-lg border focus:border-[#3ea6ff] outline-none transition-colors ${borderClassName}`}
                placeholder="0"
                style={{ appearance: 'none' }}
                disabled={max <= 0 && value === 0}
            />
            <style>{`
                input[type="text"] {
                    -moz-appearance: textfield;
                }
                input::-webkit-outer-spin-button,
                input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
            `}</style>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none text-text-secondary">%</span>

            {/* Max indicator tooltip or subtle text? keeping it simple for now, maybe add logic later if needed. 
                Premium UX: Add a subtle text below if truncated? No space. 
                Used border color change for feedback.
            */}
        </div>
    );
};

export const ABTestingModal: React.FC<ABTestingModalProps> = ({
    isOpen,
    onClose,
    initialTab,
    currentTitle,
    currentThumbnail,
    titleVariants,
    thumbnailVariants,
    onSave,
    initialResults = { titles: [], thumbnails: [] }
}) => {
    const [activeTab, setActiveTab] = useState<ABTestMode>(initialTab);
    const [titles, setTitles] = useState<string[]>(['', '', '']);
    const [thumbnails, setThumbnails] = useState<string[]>(['', '', '']);
    const [results, setResults] = useState<{ titles: number[], thumbnails: number[] }>({
        titles: [0, 0, 0],
        thumbnails: [0, 0, 0]
    });
    const [showResults, setShowResults] = useState(false);

    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

    // Initialize with existing data when modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            // Initialize titles
            const initTitles = [...titleVariants];
            if (initTitles.length === 0 && currentTitle) {
                initTitles[0] = currentTitle;
            }
            while (initTitles.length < 3) initTitles.push('');
            setTitles(initTitles);

            // Initialize thumbnails
            const initThumbnails = [...thumbnailVariants];
            if (initThumbnails.length === 0 && currentThumbnail) {
                initThumbnails[0] = currentThumbnail;
            }
            while (initThumbnails.length < 3) initThumbnails.push('');
            setThumbnails(initThumbnails);

            // Initialize results
            const newResults = {
                titles: [...(initialResults.titles || []), 0, 0, 0].slice(0, 3),
                thumbnails: [...(initialResults.thumbnails || []), 0, 0, 0].slice(0, 3)
            };
            setResults(newResults);

            // Show results if any are non-zero
            const hasResults = (initialResults.titles?.some(v => v > 0)) || (initialResults.thumbnails?.some(v => v > 0));
            setShowResults(!!hasResults);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialTab, currentTitle, currentThumbnail, JSON.stringify(titleVariants), JSON.stringify(thumbnailVariants), JSON.stringify(initialResults)]);

    const handleTitleChange = (index: number, value: string) => {
        const newTitles = [...titles];
        newTitles[index] = value;
        setTitles(newTitles);
    };

    const handleThumbnailUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const newThumbnails = [...thumbnails];
            newThumbnails[index] = reader.result as string;
            setThumbnails(newThumbnails);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveThumbnail = (index: number) => {
        const newThumbnails = [...thumbnails];
        newThumbnails[index] = '';
        setThumbnails(newThumbnails);
    };

    const handleResultChange = (type: 'titles' | 'thumbnails', index: number, value: number) => {
        setResults(prev => {
            const newArr = [...prev[type]];
            newArr[index] = value;
            return { ...prev, [type]: newArr };
        });
    };

    // Validation
    const getValidationError = (): string | null => {
        if (activeTab === 'title' || activeTab === 'both') {
            const filledTitles = titles.filter(t => t.trim()).length;
            if (filledTitles < 2) return '2nd title is required';
        }
        if (activeTab === 'thumbnail' || activeTab === 'both') {
            const filledThumbnails = thumbnails.filter(t => t).length;
            if (filledThumbnails < 2) return '2nd thumbnail is required';
        }
        return null;
    };

    const validationError = getValidationError();
    const isValid = !validationError;

    const calcMax = (arr: number[], currentIndex: number) => {
        const othersSum = arr.reduce((sum, val, idx) => {
            return idx === currentIndex ? sum : sum + (val || 0);
        }, 0);
        // Fix floating point precision: 100 - 49.4 should be 50.6, not 50.59999...
        return Math.max(0, Number((100 - othersSum).toFixed(1)));
    };

    const getBorderColor = (value: number, allValues: number[], hasContent: boolean) => {
        if (!showResults || !isValid || !hasContent) return 'border-[#5F5F5F]';

        // Use shared ranking utility
        const rank = getABTestRank(value, allValues);
        return getRankBorderClass(rank);
    };

    const handleSave = () => {
        if (!isValid) return;

        // Determine if packaging content changed (not just results)
        const currentValidTitles = titles.filter(t => t.trim());
        const currentValidThumbnails = thumbnails.filter(t => t);

        let packagingChanged = false;
        if (activeTab === 'title') {
            packagingChanged = JSON.stringify(currentValidTitles) !== JSON.stringify(titleVariants);
        } else if (activeTab === 'thumbnail') {
            packagingChanged = JSON.stringify(currentValidThumbnails) !== JSON.stringify(thumbnailVariants);
        } else { // both
            const titlesChanged = JSON.stringify(currentValidTitles) !== JSON.stringify(titleVariants);
            const thumbnailsChanged = JSON.stringify(currentValidThumbnails) !== JSON.stringify(thumbnailVariants);
            packagingChanged = titlesChanged || thumbnailsChanged;
        }

        const saveData = {
            mode: activeTab,
            titles: currentValidTitles,
            thumbnails: currentValidThumbnails,
            results: {
                titles: showResults ? results.titles.slice(0, currentValidTitles.length) : currentValidTitles.map(() => 0),
                thumbnails: showResults ? results.thumbnails.slice(0, currentValidThumbnails.length) : currentValidThumbnails.map(() => 0)
            },
            packagingChanged
        };

        onSave(saveData);
        onClose();
    };

    if (!isOpen) return null;

    const tabs: { id: ABTestMode; label: string }[] = [
        { id: 'title', label: 'Title only' },
        { id: 'thumbnail', label: 'Thumbnail only' },
        { id: 'both', label: 'Title and thumbnail' }
    ];

    const getSaveButtonText = () => {
        // If no valid test configured, standard text (though button disabled usually)
        if (!isValid) return 'Set test';

        // Check if we started with an existing test
        const isExistingTest = titleVariants.length > 0 || thumbnailVariants.length > 0;

        if (!isExistingTest) return 'Set test';

        // Check if content has changed based on active tab
        let contentChanged = false;

        // Helper to normalize logic (trim strings, filter empty? The modal state keeps empty strings for slots)
        // But titleVariants prop likely contains only valid ones? 
        // Let's assume titleVariants prop has EXACTLY what was saved. 
        // Modal state `titles` has 3 slots always. We should filter `titles` to compare.
        const currentValidTitles = titles.filter(t => t.trim());
        const currentValidThumbnails = thumbnails.filter(t => t);

        if (activeTab === 'title') {
            contentChanged = JSON.stringify(currentValidTitles) !== JSON.stringify(titleVariants);
        } else if (activeTab === 'thumbnail') {
            contentChanged = JSON.stringify(currentValidThumbnails) !== JSON.stringify(thumbnailVariants);
        } else { // both
            const titlesChanged = JSON.stringify(currentValidTitles) !== JSON.stringify(titleVariants);
            const thumbnailsChanged = JSON.stringify(currentValidThumbnails) !== JSON.stringify(thumbnailVariants);
            contentChanged = titlesChanged || thumbnailsChanged;
        }

        if (contentChanged) return 'Set test';

        return 'Save';
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-[var(--modal-bg)] rounded-xl w-full max-w-[960px] max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header - 63pt */}
                <div className="flex items-center justify-between px-6 border-b border-modal-border" style={{ height: '63px' }}>
                    <h2 className="text-xl font-medium text-modal-text-primary">A/B Testing</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-modal-text-secondary hover:text-modal-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto" style={{ paddingLeft: '40px', paddingRight: '24px', paddingTop: '20px', paddingBottom: '24px' }}>
                    {/* Subtitle */}
                    <div className="mb-5 flex items-center justify-between">
                        <span className="text-lg text-modal-text-primary">Test and compare your thumbnails and titles</span>
                        {isValid && (
                            <button
                                onClick={() => setShowResults(!showResults)}
                                className={`
                                    flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                                    ${showResults
                                        ? 'bg-[#3ea6ff]/10 text-[#3ea6ff] border border-[#3ea6ff]/20'
                                        : 'bg-modal-button-bg text-modal-text-secondary hover:text-modal-text-primary'
                                    }
                                `}
                            >
                                <Plus size={14} className={showResults ? 'rotate-45 transition-transform' : 'transition-transform'} />
                                Watch time share
                            </button>
                        )}
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex gap-2" style={{ marginBottom: '20px' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    px-4 h-8 rounded-lg text-sm font-medium transition-colors
                                    ${activeTab === tab.id
                                        ? 'bg-modal-button-active-bg text-modal-button-active-text'
                                        : 'bg-modal-button-bg text-modal-button-text hover:bg-modal-button-hover'
                                    }
                                `}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Title Only */}
                    {activeTab === 'title' && (
                        <div className="space-y-4">
                            {[0, 1, 2].map(index => (
                                <div key={`title-${index}`} className="flex gap-4">
                                    <div
                                        className="bg-modal-card-bg rounded-2xl p-4"
                                        style={{ width: '553px' }}
                                    >
                                        <div
                                            className={`relative bg-modal-surface border rounded-2xl p-4 pt-3
                                                hover:border-[#AAAAAA] focus-within:border-[#AAAAAA] transition-colors ${getBorderColor(results.titles[index], results.titles, !!titles[index])}`}
                                            style={{ height: '148px' }}
                                        >
                                            <div className="text-xs text-modal-text-secondary mb-2">
                                                <span>Title{index < 2 ? ' (required)' : ''}</span>
                                            </div>
                                            <textarea
                                                value={titles[index]}
                                                onChange={(e) => handleTitleChange(index, e.target.value)}
                                                placeholder={`Add title ${index + 1}`}
                                                className="w-full h-[calc(100%-32px)] bg-transparent text-sm text-modal-text-primary placeholder:text-modal-placeholder 
                                                    resize-none focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Result Input */}
                                    {showResults && isValid && (
                                        <div className="w-[100px] bg-modal-card-bg rounded-2xl p-4 flex flex-col justify-center items-center animate-in fade-in slide-in-from-left-4 duration-200">
                                            <div className="text-xs text-modal-text-secondary mb-2 text-center w-full">Share</div>
                                            <SmartPercentageInput
                                                value={results.titles[index]}
                                                onChange={(val) => handleResultChange('titles', index, val)}
                                                max={calcMax(results.titles, index)}
                                                borderClassName={getBorderColor(results.titles[index], results.titles, !!titles[index])}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Thumbnail Only */}
                    {activeTab === 'thumbnail' && (
                        <div className="space-y-4">
                            {[0, 1, 2].map(index => (
                                <div key={`thumb-${index}`} className="flex items-center gap-6">
                                    <div className="flex gap-4">
                                        <div
                                            className="bg-modal-card-bg rounded-2xl flex items-center"
                                            style={{ padding: '16px', height: '180px' }}
                                        >
                                            {thumbnails[index] ? (
                                                <div
                                                    className={`relative rounded-xl border border-dashed group cursor-pointer ${getBorderColor(results.thumbnails[index], results.thumbnails, !!thumbnails[index])}`}
                                                    style={{ padding: '4px' }}
                                                    onClick={() => fileInputRefs.current[index]?.click()}
                                                >
                                                    <img
                                                        src={thumbnails[index]}
                                                        alt={`Thumbnail ${index + 1}`}
                                                        className="rounded-lg object-cover"
                                                        style={{ width: '257px', height: '140px' }}
                                                    />
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemoveThumbnail(index);
                                                        }}
                                                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white 
                                                            flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => fileInputRefs.current[index]?.click()}
                                                    className={`rounded-xl border border-dashed 
                                                        hover:border-[#AAAAAA] transition-colors flex flex-col items-center justify-center gap-2
                                                        bg-modal-input-bg group ${getBorderColor(results.thumbnails[index], results.thumbnails, !!thumbnails[index])}`}
                                                    style={{ width: '265px', height: '148px' }}
                                                >
                                                    <Plus size={32} className="text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors" />
                                                    <span className="text-base text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors">Add thumbnail</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Result Input */}
                                        {showResults && isValid && (
                                            <div className="w-[100px] bg-modal-card-bg rounded-2xl p-4 flex flex-col justify-center items-center animate-in fade-in slide-in-from-left-4 duration-200" style={{ height: '180px' }}>
                                                <div className="text-xs text-modal-text-secondary mb-2 text-center w-full">Share</div>
                                                <SmartPercentageInput
                                                    value={results.thumbnails[index]}
                                                    onChange={(val) => handleResultChange('thumbnails', index, val)}
                                                    max={calcMax(results.thumbnails, index)}
                                                    borderClassName={getBorderColor(results.thumbnails[index], results.thumbnails, !!thumbnails[index])}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <span className="text-sm text-modal-text-secondary">
                                        Thumbnail {index + 1}{index < 2 ? ' (required)' : ''}
                                    </span>
                                    <input
                                        ref={el => { fileInputRefs.current[index] = el; }}
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleThumbnailUpload(index, e)}
                                        className="hidden"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Title and Thumbnail - Combined Rows */}
                    {activeTab === 'both' && (
                        <div className="space-y-4">
                            {[0, 1, 2].map(index => (
                                <div
                                    key={`both-${index}`}
                                    className="bg-modal-card-bg rounded-2xl p-4 flex gap-4"
                                    style={{ height: '180px' }}
                                >
                                    {/* Combined Block: Thumbnail + Title */}
                                    <div className="flex-1 flex gap-4 overflow-hidden">
                                        {/* Thumbnail */}
                                        <div className="flex items-center">
                                            {thumbnails[index] ? (
                                                <div
                                                    className={`relative rounded-xl border border-dashed group cursor-pointer ${getBorderColor(results.thumbnails[index], results.thumbnails, !!(titles[index] || thumbnails[index]))}`}
                                                    style={{ padding: '4px' }}
                                                    onClick={() => fileInputRefs.current[index]?.click()}
                                                >
                                                    <img
                                                        src={thumbnails[index]}
                                                        alt={`Thumbnail ${index + 1}`}
                                                        className="rounded-lg object-cover"
                                                        style={{ width: '257px', height: '140px' }}
                                                    />
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemoveThumbnail(index);
                                                        }}
                                                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white 
                                                            flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => fileInputRefs.current[index]?.click()}
                                                    className={`rounded-xl border border-dashed 
                                                        hover:border-[#AAAAAA] transition-colors flex flex-col items-center justify-center gap-2
                                                        bg-modal-input-bg group ${getBorderColor(results.thumbnails[index], results.thumbnails, !!(titles[index] || thumbnails[index]))}`}
                                                    style={{ width: '265px', height: '148px' }}
                                                >
                                                    <Plus size={32} className="text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors" />
                                                    <span className="text-base text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors text-center px-2">Add thumbnail</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Title */}
                                        <div
                                            className={`flex-1 relative bg-modal-surface border rounded-2xl p-4 pt-3
                                                hover:border-[#AAAAAA] focus-within:border-[#AAAAAA] transition-colors overflow-hidden ${getBorderColor(results.titles[index], results.titles, !!(titles[index] || thumbnails[index]))}`}
                                        >
                                            <div className="text-xs text-modal-text-secondary mb-2 whitespace-nowrap">
                                                <span>Title {index + 1}{index < 2 ? ' (req.)' : ''}</span>
                                            </div>
                                            <textarea
                                                value={titles[index]}
                                                onChange={(e) => handleTitleChange(index, e.target.value)}
                                                placeholder={`Add title ${index + 1}`}
                                                className="w-full h-[calc(100%-32px)] bg-transparent text-sm text-modal-text-primary placeholder:text-modal-placeholder 
                                                    resize-none focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Unified Result Input for Both */}
                                    {showResults && isValid && (
                                        <div className="w-[100px] h-full flex flex-col justify-center animate-in fade-in slide-in-from-left-2 duration-200">
                                            <div className="text-xs text-modal-text-secondary mb-2 text-center w-full">Share</div>
                                            <SmartPercentageInput
                                                value={results.titles[index]}
                                                onChange={(val) => {
                                                    // Update both title and thumbnail result simultaneously to keep them in sync
                                                    setResults(prev => {
                                                        const newTitles = [...prev.titles];
                                                        const newThumbnails = [...prev.thumbnails];
                                                        newTitles[index] = val;
                                                        newThumbnails[index] = val;
                                                        return { titles: newTitles, thumbnails: newThumbnails };
                                                    });
                                                }}
                                                max={calcMax(results.titles, index)}
                                                borderClassName={getBorderColor(results.titles[index], results.titles, !!(titles[index] || thumbnails[index]))}
                                            />
                                        </div>
                                    )}

                                    <input
                                        ref={el => { fileInputRefs.current[index] = el; }}
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleThumbnailUpload(index, e)}
                                        className="hidden"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer - 67pt */}
                <div className="flex items-center justify-between px-6 border-t border-modal-border" style={{ height: '67px' }}>
                    <span className="text-sm text-modal-text-secondary">
                        {validationError || ''}
                    </span>
                    <button
                        onClick={handleSave}
                        disabled={!isValid}
                        className={`
                            px-4 h-10 rounded-full text-sm font-medium transition-colors
                            ${isValid
                                ? 'bg-modal-button-active-bg text-modal-button-active-text hover:opacity-90'
                                : 'bg-modal-button-bg text-modal-text-secondary cursor-not-allowed'
                            }
                        `}
                    >
                        {getSaveButtonText()}
                    </button>
                </div>
            </div>
        </div >,
        document.body
    );
};
