import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { PortalTooltip } from './PortalTooltip'
import clsx from 'clsx'

interface ConfirmDeleteButtonProps {
    /** Called on confirmed (second) click */
    onConfirm: () => void
    /** Icon size in pixels */
    size?: number
    /** Additional className for the button */
    className?: string
    /** Reset timeout in ms (revert to initial state). Default: 2000 */
    resetDelay?: number
    /** Tooltip text for initial state */
    title?: string
}

/**
 * ConfirmDeleteButton — double-click delete pattern.
 *
 * First click: icon changes from Trash to AlertTriangle + "Are you sure?" text.
 * Second click (within resetDelay): triggers onConfirm.
 * If no second click within resetDelay: reverts to initial state.
 */
export const ConfirmDeleteButton: React.FC<ConfirmDeleteButtonProps> = ({
    onConfirm,
    size = 13,
    className,
    resetDelay = 2000,
    title = 'Delete',
}) => {
    const [armed, setArmed] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const reset = useCallback(() => {
        setArmed(false)
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        if (armed) {
            reset()
            onConfirm()
        } else {
            setArmed(true)
            timerRef.current = setTimeout(reset, resetDelay)
        }
    }, [armed, onConfirm, reset, resetDelay])

    return (
        <PortalTooltip
            content={armed ? 'Click again to confirm' : title}
            enterDelay={armed ? 0 : 500}
            noAnimation={armed}
        >
            <button
                onClick={handleClick}
                className={clsx(
                    'flex items-center gap-1 rounded transition-all',
                    armed
                        ? 'text-red-400 bg-red-500/10 px-2 py-1'
                        : 'text-text-tertiary hover:text-red-400 hover:bg-red-500/10 p-1.5',
                    className,
                )}
            >
                {armed ? (
                    <>
                        <AlertTriangle size={size} />
                        <span className="text-[10px] font-medium">Are you sure?</span>
                    </>
                ) : (
                    <Trash2 size={size} />
                )}
            </button>
        </PortalTooltip>
    )
}
