import React from 'react';
import { SplitButton } from '../../../../../components/ui/atoms/SplitButton/SplitButton';

interface SaveMenuProps {
    isSaving: boolean;
    isPackagingDirty: boolean;
    isDraft: boolean;
    hasCoverImage: boolean;
    currentPackagingVersion: number;
    onSaveDraft: () => void;
    onSaveVersion: () => void;
    isUploading?: boolean;
}

export const SaveMenu: React.FC<SaveMenuProps> = ({
    isSaving,
    isPackagingDirty,
    isDraft,
    hasCoverImage,
    currentPackagingVersion,
    onSaveDraft,
    onSaveVersion,
    isUploading = false
}) => {
    const isDisabled = !isPackagingDirty || isSaving || isUploading;
    const isDropdownDisabled = !hasCoverImage || isSaving || isUploading || (!isPackagingDirty && !isDraft);

    const label = isSaving
        ? 'Saving...'
        : isUploading
            ? 'Uploading...'
            : !isPackagingDirty
                ? 'Saved as Draft'
                : 'Save as Draft';

    // If dropdown is disabled, fall back to simple mode (no split)
    if (isDropdownDisabled) {
        return (
            <SplitButton
                label={label}
                onClick={onSaveDraft}
                disabled={isDisabled}
                isLoading={isSaving || isUploading}
                loadingLabel={isSaving ? 'Saving...' : 'Uploading...'}
                variant="primary"
                size="sm"
            >
                <div className="px-4 py-2.5 text-xs text-text-tertiary whitespace-nowrap">
                    Cover image required
                </div>
            </SplitButton>
        );
    }

    return (
        <SplitButton
            label={label}
            onClick={onSaveDraft}
            disabled={isDisabled}
            isLoading={isSaving || isUploading}
            loadingLabel={isSaving ? 'Saving...' : 'Uploading...'}
            variant="primary"
            size="sm"
        >
            <button
                onClick={onSaveVersion}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-text-primary hover:bg-hover-bg transition-colors flex items-center justify-between group whitespace-nowrap"
            >
                <span>Save as v.{currentPackagingVersion}</span>
            </button>
        </SplitButton>
    );
};
