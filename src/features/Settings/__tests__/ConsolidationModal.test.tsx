import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsolidationModal } from '../components/ConsolidationModal';
import { Timestamp } from 'firebase/firestore';

// --- Mocks ---
const mockCallConsolidation = vi.fn();
const mockApplyConsolidation = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../core/services/ai/aiProxyService', () => ({
    callConsolidation: (...args: unknown[]) => mockCallConsolidation(...args),
}));

vi.mock('../../../core/services/ai/chatService', () => ({
    ChatService: {
        applyConsolidation: (...args: unknown[]) => mockApplyConsolidation(...args),
    },
}));

vi.mock('../../../core/stores/uiStore', () => ({
    useUIStore: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../../core/hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'user-1' } }),
}));

vi.mock('../../../core/stores/channelStore', () => ({
    useChannelStore: () => ({ currentChannel: { id: 'chan-1' } }),
}));

vi.mock('../../../core/hooks/useVideosCatalog', () => ({
    useVideosCatalog: () => [],
}));

vi.mock('../../../core/hooks/useKnowledgeCatalog', () => ({
    useKnowledgeCatalog: () => [],
}));

const now = Timestamp.now();

const mockMemories = [
    { id: 'm1', conversationTitle: 'Session Alpha', content: 'Alpha content here\nSecond line', protected: false, source: 'chat' as const, createdAt: now, updatedAt: now },
    { id: 'm2', conversationTitle: 'Session Beta', content: 'Beta content', protected: false, source: 'chat' as const, createdAt: now, updatedAt: now },
    { id: 'm3', conversationTitle: 'Protected Memory', content: 'Do not merge', protected: true, source: 'manual' as const, createdAt: now, updatedAt: now },
];

vi.mock('../../../core/stores/chat/chatStore', () => ({
    useChatStore: (selector: (s: Record<string, unknown>) => unknown) => {
        const state = {
            memories: mockMemories,
            aiSettings: { defaultModel: 'gemini-2.5-pro', globalSystemPrompt: '', responseLanguage: 'auto', responseStyle: 'balanced' },
        };
        return selector(state);
    },
}));

// Mock MODEL_REGISTRY
vi.mock('../../../core/types/chat/chat', async () => {
    const actual = await vi.importActual('../../../core/types/chat/chat');
    return {
        ...actual,
        MODEL_REGISTRY: [
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini', thinkingOptions: [{ id: 'auto', label: 'Auto', value: -1 }], thinkingDefault: 'auto', thinkingMode: 'budget' },
            { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic', thinkingOptions: [{ id: 'high', label: 'High', value: 'high' }, { id: 'off', label: 'Off', value: 'off' }], thinkingDefault: 'high', thinkingMode: 'adaptive' },
        ],
    };
});

describe('ConsolidationModal — Selection step', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders memory list with checkboxes', () => {
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);
        expect(screen.getByText('Session Alpha')).toBeInTheDocument();
        expect(screen.getByText('Session Beta')).toBeInTheDocument();
        expect(screen.getByText('Protected Memory')).toBeInTheDocument();
    });

    it('shows protected label on protected memories', () => {
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);
        expect(screen.getByText('Protected')).toBeInTheDocument();
    });

    it('Generate button disabled with < 2 selections', () => {
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);
        // Deselect all first
        fireEvent.click(screen.getByText('Deselect All'));
        // Select only one
        fireEvent.click(screen.getByText('Session Alpha'));
        // Button atom wraps text in <span>, so find the <button> ancestor
        const generateBtn = screen.getByText('Generate').closest('button')!;
        expect(generateBtn).toBeDisabled();
    });

    it('selecting/deselecting updates count', () => {
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);
        // Initially 2 of 3 selected (unprotected)
        expect(screen.getByText(/2 of 3 memories selected/)).toBeInTheDocument();

        // Deselect one
        fireEvent.click(screen.getByText('Session Alpha'));
        expect(screen.getByText(/1 of 3 memories selected/)).toBeInTheDocument();
    });

    it('Select All / Deselect All toggles', () => {
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);
        // Initially all unprotected selected → button says "Deselect All"
        expect(screen.getByText('Deselect All')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Deselect All'));
        expect(screen.getByText(/0 of 3 memories selected/)).toBeInTheDocument();
        expect(screen.getByText('Select All')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Select All'));
        expect(screen.getByText(/2 of 3 memories selected/)).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
        const { container } = render(<ConsolidationModal isOpen={false} onClose={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });
});

describe('ConsolidationModal — Preview/Save/Error', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loading state shows spinner and model name', async () => {
        mockCallConsolidation.mockReturnValue(new Promise(() => {})); // never resolves
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText(/Analyzing 2 memories with Gemini 2.5 Pro/)).toBeInTheDocument();
        });
    });

    it('noChangesNeeded shows descriptive message', async () => {
        mockCallConsolidation.mockResolvedValue({
            memories: [],
            reasoning: 'Already optimal',
            noChangesNeeded: true,
        });
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText(/don't overlap enough/)).toBeInTheDocument();
            expect(screen.getByText('Already optimal')).toBeInTheDocument();
        });
    });

    it('preview step renders reasoning and memory cards with edit toggle', async () => {
        mockCallConsolidation.mockResolvedValue({
            memories: [{ title: 'Merged Title', content: 'Merged content' }],
            reasoning: 'Topics merged',
            noChangesNeeded: false,
        });
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText('Topics merged')).toBeInTheDocument();
            // Read mode: title shown as text, not input
            expect(screen.getByText('Merged Title')).toBeInTheDocument();
        });

        // Click pencil to enter edit mode
        fireEvent.click(screen.getByTitle('Edit'));
        expect(screen.getByDisplayValue('Merged Title')).toBeInTheDocument();
    });

    it('user edits are passed to applyConsolidation', async () => {
        mockCallConsolidation.mockResolvedValue({
            memories: [{ title: 'Original', content: 'Original content' }],
            reasoning: 'R',
            noChangesNeeded: false,
        });
        mockApplyConsolidation.mockResolvedValue(undefined);

        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);
        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText('Original')).toBeInTheDocument();
        });

        // Enter edit mode and edit the title
        fireEvent.click(screen.getByTitle('Edit'));
        const titleInput = screen.getByDisplayValue('Original');
        fireEvent.change(titleInput, { target: { value: 'Edited Title' } });

        fireEvent.click(screen.getByText('Save'));

        await waitFor(() => {
            expect(mockApplyConsolidation).toHaveBeenCalledWith(
                'user-1',
                'chan-1',
                expect.arrayContaining(['m1', 'm2']),
                [{ title: 'Edited Title', content: 'Original content' }],
            );
        });
    });

    it('error state shows message and retry button', async () => {
        mockCallConsolidation.mockRejectedValue(new Error('Rate limit exceeded'));
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => {
            // Humanized error message (not raw CF error)
            expect(screen.getByText(/AI service is busy/)).toBeInTheDocument();
            expect(screen.getByText('Try Again')).toBeInTheDocument();
        });
    });

    it('retry returns to selection step', async () => {
        mockCallConsolidation.mockRejectedValue(new Error('Something broke'));
        render(<ConsolidationModal isOpen={true} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText('Try Again')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Try Again'));

        expect(screen.getByText('Generate')).toBeInTheDocument();
    });
});
