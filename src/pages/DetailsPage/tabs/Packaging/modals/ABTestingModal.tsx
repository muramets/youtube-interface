import React from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import { Button } from '../../../../../components/ui/atoms/Button';
import { useABTestingModalState, type ABTestMode } from './hooks/useABTestingModalState';
import { ThumbnailSlot, TitleInputCard, ShareResultCell } from './components';

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
        packagingChanged: boolean;
    }) => void;
    initialResults?: {
        titles: number[];
        thumbnails: number[];
    };
}

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
    const {
        activeTab,
        setActiveTab,
        titles,
        thumbnails,
        results,
        showResults,
        setShowResults,
        fileInputRefs,
        validationError,
        isValid,
        canSave,
        handleTitleChange,
        handleThumbnailUpload,
        handleRemoveThumbnail,
        handleResultChange,
        handleBothResultChange,
        calcMax,
        getBorderColor,
        prepareSaveData,
        getSaveButtonText
    } = useABTestingModalState({
        isOpen,
        initialTab,
        currentTitle,
        currentThumbnail,
        titleVariants,
        thumbnailVariants,
        initialResults
    });

    const handleSave = () => {
        if (!isValid) return;
        onSave(prepareSaveData());
        onClose();
    };

    if (!isOpen) return null;

    const tabs: { id: ABTestMode; label: string }[] = [
        { id: 'title', label: 'Title only' },
        { id: 'thumbnail', label: 'Thumbnail only' },
        { id: 'both', label: 'Title and thumbnail' }
    ];

    // Helper to render hidden file input for thumbnail uploads
    const renderFileInput = (index: number) => (
        <input
            ref={el => { fileInputRefs.current[index] = el; }}
            type="file"
            accept="image/*"
            onChange={(e) => handleThumbnailUpload(index, e)}
            className="hidden"
        />
    );

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-[var(--modal-bg)] rounded-xl w-full max-w-[960px] max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 border-b border-modal-border" style={{ height: '63px' }}>
                    <h2 className="text-xl font-medium text-modal-text-primary">A/B Testing</h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="!p-2 !rounded-full text-modal-text-secondary hover:text-modal-text-primary"
                    >
                        <X size={20} />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto" style={{ paddingLeft: '40px', paddingRight: '24px', paddingTop: '20px', paddingBottom: '24px' }}>
                    {/* Subtitle + Results Toggle */}
                    <div className="mb-5 flex items-center justify-between">
                        <span className="text-lg text-modal-text-primary">Test and compare your thumbnails and titles</span>
                        {isValid && (
                            <button
                                onClick={() => setShowResults(!showResults)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                                    ${showResults
                                        ? 'bg-[#3ea6ff]/10 text-[#3ea6ff] border border-[#3ea6ff]/20'
                                        : 'bg-modal-button-bg text-modal-text-secondary hover:text-modal-text-primary'
                                    }`}
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
                                className={`px-4 h-8 rounded-lg text-sm font-medium transition-colors
                                    ${activeTab === tab.id
                                        ? 'bg-modal-button-active-bg text-modal-button-active-text'
                                        : 'bg-modal-button-bg text-modal-button-text hover:bg-modal-button-hover'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Title Only Tab */}
                    {activeTab === 'title' && (
                        <div className="space-y-4">
                            {[0, 1, 2].map(index => (
                                <div key={`title-${index}`} className="flex gap-4">
                                    <div className="bg-modal-card-bg rounded-2xl p-4" style={{ width: '553px' }}>
                                        <TitleInputCard
                                            value={titles[index]}
                                            index={index}
                                            borderClassName={getBorderColor(results.titles[index], results.titles, !!titles[index])}
                                            onChange={(val) => handleTitleChange(index, val)}
                                        />
                                    </div>
                                    {showResults && isValid && (
                                        <ShareResultCell
                                            value={results.titles[index]}
                                            max={calcMax(results.titles, index)}
                                            borderClassName={getBorderColor(results.titles[index], results.titles, !!titles[index])}
                                            onChange={(val) => handleResultChange('titles', index, val)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Thumbnail Only Tab */}
                    {activeTab === 'thumbnail' && (
                        <div className="space-y-4">
                            {[0, 1, 2].map(index => (
                                <div key={`thumb-${index}`} className="flex items-center gap-6">
                                    <div className="flex gap-4">
                                        <div className="bg-modal-card-bg rounded-2xl flex items-center" style={{ padding: '16px', height: '180px' }}>
                                            <ThumbnailSlot
                                                src={thumbnails[index]}
                                                index={index}
                                                borderClassName={getBorderColor(results.thumbnails[index], results.thumbnails, !!thumbnails[index])}
                                                onUpload={() => fileInputRefs.current[index]?.click()}
                                                onRemove={() => handleRemoveThumbnail(index)}
                                            />
                                        </div>
                                        {showResults && isValid && (
                                            <ShareResultCell
                                                value={results.thumbnails[index]}
                                                max={calcMax(results.thumbnails, index)}
                                                borderClassName={getBorderColor(results.thumbnails[index], results.thumbnails, !!thumbnails[index])}
                                                onChange={(val) => handleResultChange('thumbnails', index, val)}
                                                height="180px"
                                            />
                                        )}
                                    </div>
                                    <span className="text-sm text-modal-text-secondary">
                                        Thumbnail {index + 1}{index < 2 ? ' (required)' : ''}
                                    </span>
                                    {renderFileInput(index)}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Both Tab */}
                    {activeTab === 'both' && (
                        <div className="space-y-4">
                            {[0, 1, 2].map(index => (
                                <div
                                    key={`both-${index}`}
                                    className="bg-modal-card-bg rounded-2xl p-4 flex gap-4"
                                    style={{ height: '180px' }}
                                >
                                    <div className="flex-1 flex gap-4 overflow-hidden">
                                        <div className="flex items-center">
                                            <ThumbnailSlot
                                                src={thumbnails[index]}
                                                index={index}
                                                borderClassName={getBorderColor(results.thumbnails[index], results.thumbnails, !!(titles[index] || thumbnails[index]))}
                                                onUpload={() => fileInputRefs.current[index]?.click()}
                                                onRemove={() => handleRemoveThumbnail(index)}
                                            />
                                        </div>
                                        <TitleInputCard
                                            value={titles[index]}
                                            index={index}
                                            borderClassName={getBorderColor(results.titles[index], results.titles, !!(titles[index] || thumbnails[index]))}
                                            onChange={(val) => handleTitleChange(index, val)}
                                            compact
                                        />
                                    </div>
                                    {showResults && isValid && (
                                        <div className="w-[100px] h-full flex flex-col justify-center animate-in fade-in slide-in-from-left-2 duration-200">
                                            <div className="text-xs text-modal-text-secondary mb-2 text-center w-full">Share</div>
                                            <ShareResultCell
                                                value={results.titles[index]}
                                                max={calcMax(results.titles, index)}
                                                borderClassName={getBorderColor(results.titles[index], results.titles, !!(titles[index] || thumbnails[index]))}
                                                onChange={(val) => handleBothResultChange(index, val)}
                                            />
                                        </div>
                                    )}
                                    {renderFileInput(index)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 border-t border-modal-border" style={{ height: '67px' }}>
                    <span className="text-sm text-modal-text-secondary">{validationError || ''}</span>
                    <Button variant="primary" size="md" onClick={handleSave} disabled={!canSave}>
                        {getSaveButtonText()}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
