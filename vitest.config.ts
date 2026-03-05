/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        projects: [
            // Frontend — React + jsdom
            {
                test: {
                    name: 'frontend',
                    root: '.',
                    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts'],
                    environment: 'jsdom',
                    setupFiles: './src/test/setup.ts',
                    css: false,
                    globals: true,
                },
            },
            // Cloud Functions — Node.js
            {
                test: {
                    name: 'functions',
                    root: './functions',
                    include: ['src/**/*.test.ts'],
                    exclude: ['src/shared/**'],
                    environment: 'node',
                    alias: {
                        '^(.*)\\.js$': '$1',
                    },
                },
            },
        ],
    },
});
