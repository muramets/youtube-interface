import { describe, it, expect } from 'vitest'
import {
    getFrequencyUnit, getFrequencyValue, frequencyToHours,
    getDurationUnit, getDurationValue, durationToSeconds,
} from '../unitConversion'

// =============================================================================
// Frequency (hours-based): Sync settings
// =============================================================================

describe('getFrequencyUnit', () => {
    it('returns Weeks for multiples of 168', () => {
        expect(getFrequencyUnit(168)).toBe('Weeks')
        expect(getFrequencyUnit(336)).toBe('Weeks')
    })

    it('returns Days for multiples of 24', () => {
        expect(getFrequencyUnit(24)).toBe('Days')
        expect(getFrequencyUnit(72)).toBe('Days')
    })

    it('returns Hours for whole numbers >= 1', () => {
        expect(getFrequencyUnit(1)).toBe('Hours')
        expect(getFrequencyUnit(5)).toBe('Hours')
    })

    it('returns Minutes for fractional hours', () => {
        expect(getFrequencyUnit(0.5)).toBe('Minutes')
        expect(getFrequencyUnit(0.0167)).toBe('Minutes')
    })
})

describe('getFrequencyValue', () => {
    it('converts hours to weeks', () => {
        expect(getFrequencyValue(168, 'Weeks')).toBe(1)
        expect(getFrequencyValue(336, 'Weeks')).toBe(2)
    })

    it('converts hours to days', () => {
        expect(getFrequencyValue(24, 'Days')).toBe(1)
        expect(getFrequencyValue(72, 'Days')).toBe(3)
    })

    it('converts hours to minutes', () => {
        expect(getFrequencyValue(0.5, 'Minutes')).toBe(30)
        expect(getFrequencyValue(1, 'Minutes')).toBe(60)
    })

    it('returns hours as-is for Hours unit', () => {
        expect(getFrequencyValue(5, 'Hours')).toBe(5)
    })
})

describe('frequencyToHours', () => {
    it('converts weeks to hours', () => {
        expect(frequencyToHours(2, 'Weeks')).toBe(336)
    })

    it('converts days to hours', () => {
        expect(frequencyToHours(3, 'Days')).toBe(72)
    })

    it('converts minutes to hours', () => {
        expect(frequencyToHours(30, 'Minutes')).toBeCloseTo(0.5)
    })

    it('returns hours as-is', () => {
        expect(frequencyToHours(5, 'Hours')).toBe(5)
    })
})

// =============================================================================
// Duration (seconds-based): Clone settings
// =============================================================================

describe('getDurationUnit', () => {
    it('returns Hours for multiples of 3600', () => {
        expect(getDurationUnit(3600)).toBe('Hours')
        expect(getDurationUnit(7200)).toBe('Hours')
    })

    it('returns Minutes for multiples of 60', () => {
        expect(getDurationUnit(60)).toBe('Minutes')
        expect(getDurationUnit(300)).toBe('Minutes')
    })

    it('returns Seconds for other values', () => {
        expect(getDurationUnit(45)).toBe('Seconds')
        expect(getDurationUnit(91)).toBe('Seconds')
    })
})

describe('getDurationValue', () => {
    it('converts seconds to hours', () => {
        expect(getDurationValue(3600, 'Hours')).toBe(1)
        expect(getDurationValue(7200, 'Hours')).toBe(2)
    })

    it('converts seconds to minutes', () => {
        expect(getDurationValue(60, 'Minutes')).toBe(1)
        expect(getDurationValue(300, 'Minutes')).toBe(5)
    })

    it('returns seconds as-is', () => {
        expect(getDurationValue(45, 'Seconds')).toBe(45)
    })
})

describe('durationToSeconds', () => {
    it('converts hours to seconds', () => {
        expect(durationToSeconds(2, 'Hours')).toBe(7200)
    })

    it('converts minutes to seconds', () => {
        expect(durationToSeconds(5, 'Minutes')).toBe(300)
    })

    it('returns seconds as-is', () => {
        expect(durationToSeconds(45, 'Seconds')).toBe(45)
    })
})
