# Testing Documentation

This project uses **Vitest** as the test runner and **React Testing Library** for component testing.

## Running Tests

*   **`npm test`**: Runs tests in watch mode. Good for development.
*   **`npm run test:run`**: Runs tests once. Good for CI/CD.
*   **`npm run test:ui`**: Opens the Vitest UI to visualize tests.

## Writing Tests

### 1. Unit Tests (Utils & Hooks)
Place test files next to the source file with a `.test.ts` or `.test.tsx` extension.

**Example: `src/utils/formatUtils.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { formatViewCount } from './formatUtils';

describe('formatViewCount', () => {
    it('formats thousands correctly', () => {
        expect(formatViewCount('1500')).toBe('1.5K');
    });
});
```

### 2. Component Tests
Use `render` and `screen` from `@testing-library/react`.

**Example: `src/components/MyComponent.test.tsx`**
```tsx
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
    it('renders the title', () => {
        render(<MyComponent title="Hello" />);
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });
});
```

## Best Practices
1.  **Test Behavior, Not Implementation**: Test what the user sees and interacts with.
2.  **Mock External Services**: Use `vi.mock()` to mock API calls or Firebase services.
3.  **Keep Tests Simple**: Each test should verify one specific thing.
