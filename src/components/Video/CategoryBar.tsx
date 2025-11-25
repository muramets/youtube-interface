import React from 'react';
import { useVideo } from '../../context/VideoContext';
import '../../App.css'; // Assuming styles are still in App.css for now, or we can move them. 
// The plan didn't explicitly say to move CategoryBar styles, but it's good practice. 
// For now, I'll rely on the existing class names which are likely in App.css or index.css.
// Looking at App.tsx, it uses 'categories' and 'category-pill' classes.

export const CategoryBar: React.FC = () => {
    const { uniqueChannels, selectedChannel, setSelectedChannel } = useVideo();
    const categories = ['All', ...uniqueChannels];

    return (
        <div className="categories">
            {categories.map((category, index) => (
                <button
                    key={index}
                    className={`category-pill ${selectedChannel === category ? 'active' : ''}`}
                    onClick={() => setSelectedChannel(category)}
                >
                    {category}
                </button>
            ))}
        </div>
    );
};
