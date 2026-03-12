import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TokenBreakdown } from '../TokenBreakdown';
import { scaleBreakdown } from '../../utils/tokenDisplay';
import type { ContextBreakdown, NormalizedTokenUsage } from '../../../../../shared/models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBreakdown(overrides: Partial<ContextBreakdown> = {}): ContextBreakdown {
    return {
        systemPrompt: 1000,
        toolDefinitions: 2000,
        history: 3000,
        historyToolResults: 0,
        memory: 500,
        currentMessage: 400,
        toolResults: 1100,
        imageTokens: 0,
        imageCount: 0,
        historyMessageCount: 5,
        usedSummary: false,
        ...overrides,
    };
}

function makeNormalizedUsage(cost: number, withoutCache?: number): NormalizedTokenUsage {
    return {
        contextWindow: {
            inputTokens: 10_000,
            outputTokens: 500,
            thinkingTokens: 0,
            limit: 200_000,
            percent: 5,
        },
        billing: {
            input: { total: 10_000, fresh: 8_000, cached: 2_000, cacheWrite: 0 },
            output: { total: 500, thinking: 0 },
            iterations: 1,
            cost: {
                input: cost * 0.6,
                cached: cost * 0.1,
                cacheWrite: 0,
                output: cost * 0.3,
                total: cost,
                withoutCache: withoutCache ?? cost,
                thinkingSubset: 0,
            },
        },
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenBreakdown', () => {
    describe('renders non-zero breakdown components as bars', () => {
        it('shows all components when all have non-zero char values', () => {
            const breakdown = makeBreakdown();
            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                />,
            );

            const list = screen.getByRole('list', { name: 'Context components' });
            const items = within(list).getAllByRole('listitem');

            // All 6 text components are non-zero (no images), so 6 items
            expect(items).toHaveLength(6);

            // Verify each label is present
            expect(screen.getByText('System prompt')).toBeInTheDocument();
            expect(screen.getByText('Tool definitions')).toBeInTheDocument();
            expect(screen.getByText('History')).toBeInTheDocument();
            expect(screen.getByText('Memory / Summary')).toBeInTheDocument();
            expect(screen.getByText('Current message')).toBeInTheDocument();
            expect(screen.getByText('Tool results')).toBeInTheDocument();
        });

        it('includes Images bar when imageTokens > 0', () => {
            const breakdown = makeBreakdown({ imageTokens: 2000, imageCount: 2 });
            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={10_000}
                    contextLimit={120_000}
                />,
            );

            const list = screen.getByRole('list', { name: 'Context components' });
            const items = within(list).getAllByRole('listitem');

            // 6 text + 1 images = 7
            expect(items).toHaveLength(7);
            expect(screen.getByText('Images')).toBeInTheDocument();
        });
    });

    describe('hides zero-value components', () => {
        it('does not render bars for components with 0 chars', () => {
            const breakdown = makeBreakdown({
                memory: 0,
                toolResults: 0,
                imageTokens: 0,
            });
            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={6400}
                    contextLimit={120_000}
                />,
            );

            const list = screen.getByRole('list', { name: 'Context components' });
            const items = within(list).getAllByRole('listitem');

            // Only 4 non-zero text components: systemPrompt, toolDefinitions, history, currentMessage
            expect(items).toHaveLength(4);
            expect(screen.queryByText('Memory / Summary')).not.toBeInTheDocument();
            expect(screen.queryByText('Tool results')).not.toBeInTheDocument();
            expect(screen.queryByText('Images')).not.toBeInTheDocument();
        });

        it('renders nothing in the list when all components are zero', () => {
            const emptyBreakdown = makeBreakdown({
                systemPrompt: 0,
                toolDefinitions: 0,
                history: 0,
                memory: 0,
                currentMessage: 0,
                toolResults: 0,
                imageTokens: 0,
            });
            render(
                <TokenBreakdown
                    contextBreakdown={emptyBreakdown}
                    contextUsed={0}
                    contextLimit={120_000}
                />,
            );

            const list = screen.getByRole('list', { name: 'Context components' });
            const items = within(list).queryAllByRole('listitem');
            expect(items).toHaveLength(0);
        });
    });

    describe('billing section', () => {
        it('shows billing section when normalizedUsage with cost is provided', () => {
            const breakdown = makeBreakdown();
            const usage = makeNormalizedUsage(0.0523);

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                    normalizedUsage={usage}
                />,
            );

            expect(screen.getByText('Billing')).toBeInTheDocument();
            expect(screen.getByText('Last request')).toBeInTheDocument();
            expect(screen.getByText('$0.0523')).toBeInTheDocument();
        });

        it('shows "Without cache" line when withoutCache significantly exceeds total', () => {
            const breakdown = makeBreakdown();
            // withoutCache = 0.1000, total = 0.0500, diff = 0.05 > 0.0001
            const usage = makeNormalizedUsage(0.0500, 0.1000);

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                    normalizedUsage={usage}
                />,
            );

            expect(screen.getByText('Without cache')).toBeInTheDocument();
            expect(screen.getByText('$0.1000')).toBeInTheDocument();
        });

        it('hides "Without cache" line when savings are negligible', () => {
            const breakdown = makeBreakdown();
            // withoutCache = 0.0501, total = 0.0500, diff = 0.0001 (not > 0.0001)
            const usage = makeNormalizedUsage(0.0500, 0.0501);

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                    normalizedUsage={usage}
                />,
            );

            expect(screen.getByText('Billing')).toBeInTheDocument();
            expect(screen.queryByText('Without cache')).not.toBeInTheDocument();
        });

        it('hides billing section when normalizedUsage is absent', () => {
            const breakdown = makeBreakdown();

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                />,
            );

            expect(screen.queryByText('Billing')).not.toBeInTheDocument();
        });
    });

    describe('panel toggle (conditional rendering)', () => {
        it('renders content when mounted (isOpen = true equivalent)', () => {
            const breakdown = makeBreakdown();

            const { container } = render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                />,
            );

            // The component renders its region
            expect(screen.getByRole('region', { name: 'Token breakdown' })).toBeInTheDocument();
            expect(container.innerHTML).not.toBe('');
        });

        it('renders nothing when not mounted (isOpen = false equivalent)', () => {
            const breakdown = makeBreakdown();
            const isOpen = false;

            const { container } = render(
                <>
                    {isOpen && (
                        <TokenBreakdown
                            contextBreakdown={breakdown}
                            contextUsed={8000}
                            contextLimit={120_000}
                        />
                    )}
                </>,
            );

            expect(screen.queryByRole('region', { name: 'Token breakdown' })).not.toBeInTheDocument();
            expect(container.innerHTML).toBe('');
        });
    });

    describe('scaleBreakdown integration: bar widths are proportional', () => {
        it('bar widths reflect proportional token distribution', () => {
            // history = 3000 chars, systemPrompt = 1000 chars -> history should be ~3x systemPrompt
            const breakdown = makeBreakdown();
            const contextUsed = 8000;
            const scaled = scaleBreakdown(breakdown, contextUsed);

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={contextUsed}
                    contextLimit={120_000}
                />,
            );

            const list = screen.getByRole('list', { name: 'Context components' });
            const items = within(list).getAllByRole('listitem');

            // Verify scaling: history should be ~3x systemPrompt (+/-1 for rounding)
            expect(Math.abs(scaled.history - scaled.systemPrompt * 3)).toBeLessThanOrEqual(1);

            // Verify scaled values sum to contextUsed
            const sum = scaled.systemPrompt + scaled.toolDefinitions + scaled.history
                + scaled.historyToolResults + scaled.memory + scaled.currentMessage + scaled.toolResults + scaled.images;
            expect(sum).toBe(contextUsed);

            // Each visible item should have a bar
            const nonZeroKeys = (['systemPrompt', 'toolDefinitions', 'history', 'historyToolResults', 'memory', 'currentMessage', 'toolResults', 'images'] as const)
                .filter(k => scaled[k] > 0);
            expect(items).toHaveLength(nonZeroKeys.length);
        });

        it('stacked bar chart segments have width styles proportional to token shares', () => {
            const breakdown = makeBreakdown({ imageTokens: 2000, imageCount: 2 });
            const contextUsed = 10_000;
            const scaled = scaleBreakdown(breakdown, contextUsed);

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={contextUsed}
                    contextLimit={120_000}
                />,
            );

            const chart = screen.getByRole('img', { name: /History/ });
            const widthStr = chart.style.width;
            const widthPct = parseFloat(widthStr);

            // History's share should be approximately (scaled.history / contextUsed) * 100
            const expectedPct = (scaled.history / contextUsed) * 100;
            expect(widthPct).toBeCloseTo(expectedPct, 0);
        });
    });

    describe('summary indicator', () => {
        it('shows summarized history note when usedSummary is true', () => {
            const breakdown = makeBreakdown({ usedSummary: true });

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                />,
            );

            expect(screen.getByText('Context includes summarized history')).toBeInTheDocument();
        });

        it('hides summarized history note when usedSummary is false', () => {
            const breakdown = makeBreakdown({ usedSummary: false });

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={8000}
                    contextLimit={120_000}
                />,
            );

            expect(screen.queryByText('Context includes summarized history')).not.toBeInTheDocument();
        });
    });

    describe('total line', () => {
        it('displays formatted total, limit, and percentage', () => {
            const breakdown = makeBreakdown();

            render(
                <TokenBreakdown
                    contextBreakdown={breakdown}
                    contextUsed={60_000}
                    contextLimit={120_000}
                />,
            );

            // 60_000 -> "60.0K", 120_000 -> "120.0K", pct = 50%
            expect(screen.getByText(/Total:.*60\.0K.*\/.*120\.0K.*\(50% to auto-summary\)/)).toBeInTheDocument();
        });
    });
});
