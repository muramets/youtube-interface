import { useState, useRef, useEffect, useCallback } from 'react'
import { Clock, Check } from 'lucide-react'
import { ConfirmDeleteButton } from '../../../components/ui/atoms/ConfirmDeleteButton'
import { getSourceLabel } from '../utils/formatDate'
import type { KnowledgeVersionWithId } from '../../../core/types/knowledge'

interface VersionDropdownProps {
    versions: KnowledgeVersionWithId[]
    selectedVersionId: string | null
    onSelect: (versionId: string | null) => void
    onDelete: (versionId: string) => void
    currentSource: string
    currentModel: string
    currentDate: string
}

function formatVersionDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export const VersionDropdown = ({
    versions,
    selectedVersionId,
    onSelect,
    onDelete,
    currentSource,
    currentModel,
    currentDate,
}: VersionDropdownProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close on outside click or Escape
    useEffect(() => {
        if (!isOpen) return
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation() // Don't close Zen Mode
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('mousedown', handleClick)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen])

    const handleSelect = useCallback((versionId: string | null) => {
        onSelect(versionId)
        setIsOpen(false)
    }, [onSelect])

    const hasVersions = versions.length > 0

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-md transition-colors"
                title={hasVersions ? `${versions.length} version${versions.length !== 1 ? 's' : ''}` : 'No history'}
            >
                <Clock size={12} />
                <span>{hasVersions ? `${versions.length} version${versions.length !== 1 ? 's' : ''}` : 'No history'}</span>
            </button>

            {/* Dropdown menu */}
            {isOpen && (
                <div
                    role="listbox"
                    aria-label="Version history"
                    className="absolute right-0 top-full mt-1 w-72 bg-bg-secondary border border-border rounded-lg shadow-xl z-10 overflow-hidden"
                >
                    {/* Current version (not deletable) */}
                    <button
                        role="option"
                        aria-selected={selectedVersionId === null}
                        onClick={() => handleSelect(null)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-hover-bg transition-colors border-b border-border"
                    >
                        {selectedVersionId === null && (
                            <Check size={12} className="text-accent flex-shrink-0" />
                        )}
                        <div className={selectedVersionId === null ? '' : 'pl-5'}>
                            <div className="text-[11px] font-medium text-text-primary">Current</div>
                            <div className="text-[10px] text-text-tertiary">
                                {currentDate} · {getSourceLabel(currentSource)}
                                {currentModel && ` · ${currentModel}`}
                            </div>
                        </div>
                    </button>

                    {/* Version entries */}
                    {versions.length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-text-tertiary text-center">
                            No previous versions
                        </div>
                    ) : (
                        <div className="max-h-60 overflow-y-auto">
                            {versions.map((version) => (
                                <div
                                    key={version.id}
                                    role="option"
                                    aria-selected={selectedVersionId === version.id}
                                    className="flex items-center gap-1 px-3 py-2 hover:bg-hover-bg transition-colors group"
                                >
                                    <button
                                        onClick={() => handleSelect(version.id)}
                                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                                    >
                                        {selectedVersionId === version.id && (
                                            <Check size={12} className="text-accent flex-shrink-0" />
                                        )}
                                        <div className={selectedVersionId === version.id ? '' : 'pl-5'}>
                                            <div className="text-[11px] text-text-primary truncate">
                                                {formatVersionDate(version.createdAt)}
                                            </div>
                                            <div className="text-[10px] text-text-tertiary">
                                                {getSourceLabel(version.source)}
                                                {version.model && ` · ${version.model}`}
                                            </div>
                                        </div>
                                    </button>
                                    <div className="opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                                        <ConfirmDeleteButton
                                            onConfirm={() => onDelete(version.id)}
                                            size={11}
                                            title="Delete version"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
