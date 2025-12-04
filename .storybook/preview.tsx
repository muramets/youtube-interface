import type { Preview } from '@storybook/react-vite';
import '../src/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client= { queryClient } >
      <MemoryRouter>
      <Story />
      </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
};

export default preview;