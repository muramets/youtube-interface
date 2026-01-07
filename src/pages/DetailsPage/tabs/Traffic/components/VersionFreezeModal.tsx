import React from 'react';
import { Button } from '../../../../../components/ui/atoms/Button/Button';
import { TrafficUploader } from './TrafficUploader';
import { Info } from 'lucide-react';
import type { TrafficSource } from '../../../../../core/types/traffic';

interface VersionFreezeModalProps {
    isOpen: boolean;
    onClose: () => void;
    versionToFreeze: number;
    onFreeze: (sources: TrafficSource[]) => Promise<void>; // Pass the sources from the CSV
    onSkip: () => void; // User chooses not to freeze (maybe just switch)
}

export const VersionFreezeModal: React.FC<VersionFreezeModalProps> = ({
    isOpen,
    onClose,
    versionToFreeze,
    onFreeze,
    onSkip
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-bg-secondary border border-white/10 rounded-2xl w-full max-w-lg text-text-primary shadow-2xl flex flex-col">
                <div className="p-6">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="w-10 h-10 rounded-full bg-accent-blue/10 flex items-center justify-center text-accent-blue flex-shrink-0">
                            <Info size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold mb-2">Freeze Traffic for v.{versionToFreeze}?</h2>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                You are about to switch versions. To accurately track performance, we recommend uploading the latest traffic CSV to "freeze" the stats for Version {versionToFreeze}.
                                <br /><br />
                                Future views will be attributed to the new version.
                            </p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <TrafficUploader
                            onUpload={async (sources) => {
                                await onFreeze(sources);
                                onClose();
                            }}
                            isCompact={false}
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="secondary" onClick={onSkip}>
                            Skip & Switch Anyway
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
