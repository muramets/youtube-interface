import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';

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
    }) => void;
}

export const ABTestingModal: React.FC<ABTestingModalProps> = ({
    isOpen,
    onClose,
    initialTab,
    currentTitle,
    currentThumbnail,
    titleVariants,
    thumbnailVariants,
    onSave
}) => {
    const [activeTab, setActiveTab] = useState<ABTestMode>(initialTab);
    const [titles, setTitles] = useState<string[]>(['', '', '']);
    const [thumbnails, setThumbnails] = useState<string[]>(['', '', '']);
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
        }
    }, [isOpen, initialTab, currentTitle, currentThumbnail, titleVariants, thumbnailVariants]);

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

    const handleSave = () => {
        if (!isValid) return;
        onSave({
            mode: activeTab,
            titles: titles.filter(t => t.trim()),
            thumbnails: thumbnails.filter(t => t)
        });
        onClose();
    };

    if (!isOpen) return null;

    const tabs: { id: ABTestMode; label: string }[] = [
        { id: 'title', label: 'Title only' },
        { id: 'thumbnail', label: 'Thumbnail only' },
        { id: 'both', label: 'Title and thumbnail' }
    ];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-[#282828] rounded-xl w-full max-w-[960px] max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header - 63pt */}
                <div className="flex items-center justify-between px-6 border-b border-border" style={{ height: '63px' }}>
                    <h2 className="text-xl font-medium text-text-primary">A/B Testing</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto" style={{ paddingLeft: '40px', paddingRight: '24px', paddingTop: '20px', paddingBottom: '24px' }}>
                    {/* Subtitle */}
                    <div className="mb-5">
                        <span className="text-lg text-text-primary">Test and compare your thumbnails and titles</span>
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
                                        ? 'bg-white text-black'
                                        : 'bg-[#3F3F3F] text-text-primary hover:bg-[#535353]'
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
                                <div
                                    key={`title-${index}`}
                                    className="bg-[#1F1F1F] rounded-2xl p-4"
                                    style={{ width: '553px' }}
                                >
                                    <div
                                        className="relative bg-bg-secondary border border-[#5F5F5F] rounded-2xl p-4 pt-3
                                            hover:border-[#AAAAAA] focus-within:border-[#AAAAAA] transition-colors"
                                        style={{ height: '148px' }}
                                    >
                                        <div className="text-xs text-text-secondary mb-2">
                                            <span>Title{index < 2 ? ' (required)' : ''}</span>
                                        </div>
                                        <textarea
                                            value={titles[index]}
                                            onChange={(e) => handleTitleChange(index, e.target.value)}
                                            placeholder={`Add title ${index + 1}`}
                                            className="w-full h-[calc(100%-32px)] bg-transparent text-sm text-text-primary placeholder:text-[#717171] 
                                                resize-none focus:outline-none"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Thumbnail Only */}
                    {activeTab === 'thumbnail' && (
                        <div className="space-y-4">
                            {[0, 1, 2].map(index => (
                                <div key={`thumb-${index}`} className="flex items-center gap-6">
                                    <div
                                        className="bg-[#1F1F1F] rounded-2xl flex items-center"
                                        style={{ padding: '16px', height: '180px' }}
                                    >
                                        {thumbnails[index] ? (
                                            <div
                                                className="relative rounded-xl border border-dashed border-border group cursor-pointer"
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
                                                className="rounded-xl border border-dashed border-[#5F5F5F] 
                                                    hover:border-[#AAAAAA] transition-colors flex flex-col items-center justify-center gap-2
                                                    bg-[#282828] group"
                                                style={{ width: '265px', height: '148px' }}
                                            >
                                                <Plus size={32} className="text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors" />
                                                <span className="text-base text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors">Add thumbnail</span>
                                            </button>
                                        )}
                                    </div>
                                    <span className="text-sm text-text-secondary">
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
                                    className="bg-[#1F1F1F] rounded-2xl p-4 flex gap-4"
                                    style={{ height: '180px' }}
                                >
                                    {/* Thumbnail */}
                                    <div className="flex items-center">
                                        {thumbnails[index] ? (
                                            <div
                                                className="relative rounded-xl border border-dashed border-border group cursor-pointer"
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
                                                className="rounded-xl border border-dashed border-[#5F5F5F] 
                                                    hover:border-[#AAAAAA] transition-colors flex flex-col items-center justify-center gap-2
                                                    bg-[#282828] group"
                                                style={{ width: '265px', height: '148px' }}
                                            >
                                                <Plus size={32} className="text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors" />
                                                <span className="text-base text-[#5F5F5F] group-hover:text-[#AAAAAA] transition-colors">Add thumbnail</span>
                                            </button>
                                        )}
                                        <input
                                            ref={el => { fileInputRefs.current[index] = el; }}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleThumbnailUpload(index, e)}
                                            className="hidden"
                                        />
                                    </div>

                                    {/* Title */}
                                    <div
                                        className="flex-1 relative bg-bg-secondary border border-[#5F5F5F] rounded-2xl p-4 pt-3
                                            hover:border-[#AAAAAA] focus-within:border-[#AAAAAA] transition-colors"
                                    >
                                        <div className="text-xs text-text-secondary mb-2">
                                            <span>Title{index < 2 ? ' (required)' : ''}</span>
                                        </div>
                                        <textarea
                                            value={titles[index]}
                                            onChange={(e) => handleTitleChange(index, e.target.value)}
                                            placeholder={`Add title ${index + 1}`}
                                            className="w-full h-[calc(100%-32px)] bg-transparent text-sm text-text-primary placeholder:text-[#717171] 
                                                resize-none focus:outline-none"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer - 67pt */}
                <div className="flex items-center justify-between px-6 border-t border-border" style={{ height: '67px' }}>
                    <span className="text-sm text-text-secondary">
                        {validationError || ''}
                    </span>
                    <button
                        onClick={handleSave}
                        disabled={!isValid}
                        className={`
                            px-4 h-10 rounded-full text-sm font-medium transition-colors
                            ${isValid
                                ? 'bg-white text-black hover:bg-gray-200'
                                : 'bg-[#3F3F3F] text-text-secondary cursor-not-allowed'
                            }
                        `}
                    >
                        Set test
                    </button>
                </div>
            </div>
        </div >,
        document.body
    );
};
