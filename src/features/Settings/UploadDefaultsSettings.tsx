import React from 'react';
import type { UploadDefaults } from '../../core/services/settingsService';
import { TagsInput } from '../../components/ui/TagsInput';

interface UploadDefaultsSettingsProps {
    settings: UploadDefaults;
    onChange: (settings: UploadDefaults) => void;
}

export const UploadDefaultsSettings: React.FC<UploadDefaultsSettingsProps> = ({ settings, onChange }) => {
    const handleChange = (field: keyof UploadDefaults, value: UploadDefaults[keyof UploadDefaults]) => {
        onChange({
            ...settings,
            [field]: value
        });
    };

    const handleTagsChange = (newTags: string[]) => {
        handleChange('tags', newTags);
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-1">Upload Defaults</h3>
                <p className="text-sm text-text-secondary mb-4">
                    These settings will be applied to all new custom videos you create.
                </p>
            </div>

            <div className="space-y-4">
                {/* Title */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                        Default Title
                    </label>
                    <input
                        type="text"
                        value={settings.title || ''}
                        onChange={(e) => handleChange('title', e.target.value)}
                        placeholder="Enter default title..."
                        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                        Default Description
                    </label>
                    <textarea
                        value={settings.description || ''}
                        onChange={(e) => handleChange('description', e.target.value)}
                        placeholder="Enter default description..."
                        rows={4}
                        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:border-blue-500 transition-colors resize-none"
                    />
                </div>

                {/* Tags */}
                <div>
                    <TagsInput
                        tags={settings.tags || []}
                        onChange={handleTagsChange}
                    />
                </div>
            </div>
        </div>
    );
};
