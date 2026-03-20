import { useState, useRef, useEffect, useCallback } from 'react'
import { Clock, Check, RotateCcw } from 'lucide-react'
import { Badge } from '../../../components/ui/atoms/Badge/Badge'
import { ConfirmDeleteButton } from '../../../components/ui/atoms/ConfirmDeleteButton'
import { getOriginLabel, getEditLabel } from '../utils/formatDate'
import type { KnowledgeVersionWithId } from '../../../core/types/knowledge'

interface VersionDropdownProps {
    versions: KnowledgeVersionWithId[]
    selectedVersionId: string | null
    onSelect: (versionId: string | null) => void
    onDelete: (versionId: string) => void
    onRestore?: (versionId: string) => void
    /** IDs of versions pending deletion after restore (dimmed in UI) */
    pendingDeleteIds?: string[]
    /** The version that was restored — hidden from list (shown as Current) */
    restoredVersionId?: string
    /** KI creation source — always displayed */
    originSource: KnowledgeVersionWithId['source']
    /** Who last edited current content — displayed conditionally */
    editSource?: KnowledgeVersionWithId['source']
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

/**
 * Returns the version count label for the dropdown trigger button.
 * @param previousVersionCount — number of previous versions in Firestore subcollection
 * @returns e.g. "1 version", "3 versions"
 */
function getVersionCountLabel(previousVersionCount: number): string {
    const total = previousVersionCount + 1
    return `${total} version${total !== 1 ? 's' : ''}`
}

export const VersionDropdown = ({
    versions,
    selectedVersionId,
    onSelect,
    onDelete,
    onRestore,
    pendingDeleteIds,
    restoredVersionId,
    originSource,
    editSource,
    currentModel,
    currentDate,
}: VersionDropdownProps) => {
    const pendingSet = pendingDeleteIds?.length
        ? new Set(pendingDeleteIds)
        : null
    // Hide the restored version from list — its info is shown as Current
    const displayVersions = restoredVersionId
        ? versions.filter(v => v.id !== restoredVersionId)
        : versions
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
                e.stopPropagation() // Capture phase — prevents modal/Zen Mode ESC handlers
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick, true)
        document.addEventListener('keydown', handleKeyDown, true) // capture phase
        return () => {
            document.removeEventListener('mousedown', handleClick, true)
            document.removeEventListener('keydown', handleKeyDown, true)
        }
    }, [isOpen])

    const handleSelect = useCallback((versionId: string | null) => {
        onSelect(versionId)
        setIsOpen(false)
    }, [onSelect])

    const versionLabel = getVersionCountLabel(displayVersions.length)

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-md transition-colors"
                title={versionLabel}
            >
                <Clock size={12} />
                <span>{versionLabel}</span>
            </button>

            {/* Dropdown menu */}
            {isOpen && (
                <div
                    role="listbox"
                    aria-label="Version history"
                    className="absolute right-0 top-full mt-1 w-72 bg-bg-secondary border border-border rounded-lg shadow-xl z-popover overflow-hidden"
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
                            <div className="text-[10px] text-text-tertiary flex items-center gap-1.5 mt-0.5">
                                {currentDate}
                                <Badge variant="neutral">{getOriginLabel(originSource)}</Badge>
                                {currentModel && <span>· {currentModel}</span>}
                            </div>
                            {editSource && (
                                <div className="text-[10px] text-text-tertiary/70 mt-0.5">
                                    {getEditLabel(editSource)}
                                </div>
                            )}
                        </div>
                    </button>

                    {/* Version entries */}
                    {displayVersions.length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-text-tertiary text-center">
                            No previous versions
                        </div>
                    ) : (
                        <div className="max-h-60 overflow-y-auto">
                            {displayVersions.map((version) => {
                                const isPending = pendingSet?.has(version.id) ?? false
                                return (
                                    <div
                                        key={version.id}
                                        role="option"
                                        aria-selected={selectedVersionId === version.id}
                                        className={`flex items-center gap-1 px-3 py-2 transition-colors ${isPending ? 'opacity-40' : 'hover:bg-hover-bg group'}`}
                                    >
                                        <button
                                            onClick={isPending ? undefined : () => handleSelect(version.id)}
                                            className={`flex-1 flex items-center gap-2 text-left min-w-0 ${isPending ? 'cursor-default' : ''}`}
                                            disabled={isPending}
                                        >
                                            {selectedVersionId === version.id && !isPending && (
                                                <Check size={12} className="text-accent flex-shrink-0" />
                                            )}
                                            <div className={selectedVersionId === version.id && !isPending ? '' : 'pl-5'}>
                                                <div className="text-[11px] text-text-primary truncate">
                                                    {formatVersionDate(version.createdAt)}
                                                </div>
                                                <div className="text-[10px] text-text-tertiary flex items-center gap-1.5">
                                                    <Badge variant="neutral">{getOriginLabel(version.source)}</Badge>
                                                    {version.model && <span>· {version.model}</span>}
                                                </div>
                                            </div>
                                        </button>
                                        {isPending ? (
                                            <span className="text-[9px] text-text-tertiary flex-shrink-0">
                                                Pending removal
                                            </span>
                                        ) : (
                                            <div className="opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 flex items-center gap-0.5">
                                                {onRestore && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onRestore(version.id) }}
                                                        className="p-1.5 text-text-tertiary hover:text-accent hover:bg-accent/10 rounded transition-colors"
                                                        title="Restore this version"
                                                    >
                                                        <RotateCcw size={11} />
                                                    </button>
                                                )}
                                                <ConfirmDeleteButton
                                                    onConfirm={() => onDelete(version.id)}
                                                    size={11}
                                                    title="Delete version"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
