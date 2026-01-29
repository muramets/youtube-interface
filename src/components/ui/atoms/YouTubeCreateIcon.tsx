import React from 'react';

export const YouTubeCreateIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block', width: size, height: size }}
            className={className}
        >
            <path
                d="M12 12H8M10 10V14M5 6H15C16.1046 6 17 6.89543 17 8V16C17 17.1046 16.1046 18 15 18H5C3.89543 18 3 17.1046 3 16V8C3 6.89543 3.89543 6 5 6ZM22 8L18 11V13L22 16V8Z"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};