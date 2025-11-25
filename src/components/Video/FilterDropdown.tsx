import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Filter, Check } from 'lucide-react';
import { useVideo } from '../../context/VideoContext';
import { createPortal } from 'react-dom';

export const FilterDropdown: React.FC = () => {
    const { playlists, hiddenPlaylistIds, togglePlaylistVisibility } = useVideo();
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

    useLayoutEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right
            });
        } else {
            setPosition(null);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', () => setIsOpen(false), true);
            window.addEventListener('resize', () => setIsOpen(false));
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', () => setIsOpen(false), true);
            window.removeEventListener('resize', () => setIsOpen(false));
        };
    }, [isOpen]);

    const activeFilterCount = hiddenPlaylistIds.length;

    return (
        <>
            <button
                ref={buttonRef}
                className={`category-pill ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    marginLeft: '8px'
                }}
            >
                <Filter size={16} />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                    <span style={{
                        backgroundColor: 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        borderRadius: '50%',
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 'bold'
                    }}>
                        {activeFilterCount}
                    </span>
                )}
            </button>

            {isOpen && position && createPortal(
                <div
                    ref={dropdownRef}
                    className="animate-scale-in"
                    style={{
                        position: 'fixed',
                        top: position.top,
                        right: position.right,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '8px 0',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                        zIndex: 1000,
                        minWidth: '200px',
                        maxHeight: '300px',
                        overflowY: 'auto'
                    }}
                >
                    <div style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        borderBottom: '1px solid var(--border)',
                        marginBottom: '4px'
                    }}>
                        Hide Content From:
                    </div>
                    {playlists.length === 0 ? (
                        <div style={{ padding: '8px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                            No playlists found
                        </div>
                    ) : (
                        playlists.map(playlist => {
                            const isHidden = hiddenPlaylistIds.includes(playlist.id);
                            return (
                                <div
                                    key={playlist.id}
                                    onClick={() => togglePlaylistVisibility(playlist.id)}
                                    style={{
                                        padding: '8px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s',
                                        color: 'var(--text-primary)',
                                        fontSize: '14px'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '4px',
                                        border: '2px solid var(--text-secondary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: isHidden ? 'var(--text-primary)' : 'transparent',
                                        borderColor: isHidden ? 'var(--text-primary)' : 'var(--text-secondary)'
                                    }}>
                                        {isHidden && <Check size={12} color="var(--bg-primary)" strokeWidth={3} />}
                                    </div>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {playlist.name}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>,
                document.body
            )}
        </>
    );
};
