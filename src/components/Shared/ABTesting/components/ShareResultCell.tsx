import React from 'react';
import { SmartPercentageInput } from './SmartPercentageInput';

interface ShareResultCellProps {
    value: number;
    max: number;
    borderClassName: string;
    onChange: (value: number) => void;
    /** Fixed height for the cell container */
    height?: string;
}

/**
 * Wrapper for SmartPercentageInput with "Share" label and animation.
 * Used to display watch time share percentage inputs.
 */
export const ShareResultCell: React.FC<ShareResultCellProps> = ({
    value,
    max,
    borderClassName,
    onChange,
    height
}) => {
    return (
        <div
            className="w-[100px] bg-modal-card-bg rounded-2xl p-4 flex flex-col justify-center items-center animate-in fade-in slide-in-from-left-4 duration-200"
            style={height ? { height } : undefined}
        >
            <div className="text-xs text-modal-text-secondary mb-2 text-center w-full">Share</div>
            <SmartPercentageInput
                value={value}
                onChange={onChange}
                max={max}
                borderClassName={borderClassName}
            />
        </div>
    );
};
